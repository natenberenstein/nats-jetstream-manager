"""Background job orchestration with persistence and progress tracking."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.core.connection_manager import ConnectionInfo
from app.core.db import get_db_connection
from app.services.message_service import MessageService


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class JobService:
    """In-process async job runner with sqlite-backed status."""

    _tasks: dict[str, asyncio.Task[Any]] = {}

    @staticmethod
    def _serialize_json(value: Any) -> str | None:
        if value is None:
            return None
        return json.dumps(value)

    @staticmethod
    def _deserialize_json(value: str | None) -> dict[str, Any] | None:
        if not value:
            return None
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except json.JSONDecodeError:
            return {"raw": value}

    @staticmethod
    def _row_to_job(row: Any) -> dict[str, Any]:
        return {
            "id": row["id"],
            "connection_id": row["connection_id"],
            "job_type": row["job_type"],
            "status": row["status"],
            "progress": float(row["progress"] or 0),
            "current": row["current"],
            "total": row["total"],
            "message": row["message"],
            "error": row["error"],
            "payload": JobService._deserialize_json(row["payload_json"]),
            "result": JobService._deserialize_json(row["result_json"]),
            "cancel_requested": bool(row["cancel_requested"]),
            "created_at": row["created_at"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
        }

    @staticmethod
    def create_job(connection_id: str, job_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        created_at = _now_iso()

        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO jobs (id, connection_id, job_type, status, progress, payload_json, created_at)
                VALUES (?, ?, ?, 'pending', 0, ?, ?)
                """,
                (job_id, connection_id, job_type, JobService._serialize_json(payload), created_at),
            )
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            conn.commit()

        if row is None:
            raise RuntimeError("Failed to create job")
        return JobService._row_to_job(row)

    @staticmethod
    def get_job(job_id: str, connection_id: str | None = None) -> dict[str, Any] | None:
        with get_db_connection() as conn:
            if connection_id:
                row = conn.execute(
                    "SELECT * FROM jobs WHERE id = ? AND connection_id = ?",
                    (job_id, connection_id),
                ).fetchone()
            else:
                row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return JobService._row_to_job(row) if row else None

    @staticmethod
    def list_jobs(connection_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with get_db_connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM jobs
                WHERE connection_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (connection_id, limit),
            ).fetchall()
            return [JobService._row_to_job(row) for row in rows]

    @staticmethod
    def _update_job(
        job_id: str,
        *,
        status: str | None = None,
        progress: float | None = None,
        current: int | None = None,
        total: int | None = None,
        message: str | None = None,
        error: str | None = None,
        result: dict[str, Any] | None = None,
        started_at: str | None = None,
        completed_at: str | None = None,
    ) -> None:
        fields: list[str] = []
        values: list[Any] = []

        if status is not None:
            fields.append("status = ?")
            values.append(status)
        if progress is not None:
            fields.append("progress = ?")
            values.append(progress)
        if current is not None:
            fields.append("current = ?")
            values.append(current)
        if total is not None:
            fields.append("total = ?")
            values.append(total)
        if message is not None:
            fields.append("message = ?")
            values.append(message)
        if error is not None:
            fields.append("error = ?")
            values.append(error)
        if result is not None:
            fields.append("result_json = ?")
            values.append(JobService._serialize_json(result))
        if started_at is not None:
            fields.append("started_at = ?")
            values.append(started_at)
        if completed_at is not None:
            fields.append("completed_at = ?")
            values.append(completed_at)

        if not fields:
            return

        with get_db_connection() as conn:
            conn.execute(f"UPDATE jobs SET {', '.join(fields)} WHERE id = ?", [*values, job_id])
            conn.commit()

    @staticmethod
    def cancel_job(job_id: str, connection_id: str) -> dict[str, Any] | None:
        with get_db_connection() as conn:
            conn.execute(
                "UPDATE jobs SET cancel_requested = 1 WHERE id = ? AND connection_id = ?",
                (job_id, connection_id),
            )
            row = conn.execute(
                "SELECT * FROM jobs WHERE id = ? AND connection_id = ?",
                (job_id, connection_id),
            ).fetchone()
            conn.commit()

        task = JobService._tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        return JobService._row_to_job(row) if row else None

    @staticmethod
    def _is_cancel_requested(job_id: str) -> bool:
        with get_db_connection() as conn:
            row = conn.execute("SELECT cancel_requested FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return bool(row and row["cancel_requested"])

    @staticmethod
    async def _run_job(
        job_id: str,
        runner: Callable[[Callable[[int, int, str | None], Awaitable[None]], Callable[[], bool]], Awaitable[dict[str, Any]]],
    ) -> None:
        started = _now_iso()
        JobService._update_job(job_id, status="running", started_at=started, progress=0)

        async def progress_cb(current: int, total: int, message: str | None = None) -> None:
            pct = 0 if total <= 0 else round((current / total) * 100, 2)
            JobService._update_job(
                job_id,
                progress=pct,
                current=current,
                total=total,
                message=message,
            )

        def cancel_check() -> bool:
            return JobService._is_cancel_requested(job_id)

        try:
            result = await runner(progress_cb, cancel_check)
            JobService._update_job(
                job_id,
                status="completed",
                progress=100,
                result=result,
                completed_at=_now_iso(),
            )
        except asyncio.CancelledError:
            JobService._update_job(
                job_id,
                status="cancelled",
                message="Cancelled by user",
                completed_at=_now_iso(),
            )
        except Exception as exc:
            JobService._update_job(
                job_id,
                status="failed",
                error=str(exc),
                completed_at=_now_iso(),
            )
        finally:
            JobService._tasks.pop(job_id, None)

    @staticmethod
    def submit_index_build_job(
        conn_info: ConnectionInfo,
        stream_name: str,
        limit: int = 2000,
    ) -> dict[str, Any]:
        payload = {"stream_name": stream_name, "limit": limit}
        job = JobService.create_job(conn_info.connection_id, "message_index_build", payload)

        async def runner(progress_cb, cancel_check):
            return await MessageService.build_search_index(
                conn_info,
                stream_name,
                limit=limit,
                progress_callback=progress_cb,
                cancel_check=cancel_check,
            )

        task = asyncio.create_task(JobService._run_job(job["id"], runner))
        JobService._tasks[job["id"]] = task
        return job
