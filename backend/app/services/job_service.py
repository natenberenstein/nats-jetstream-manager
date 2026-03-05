"""Background job orchestration with persistence and progress tracking."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from app.core.connection_manager import ConnectionInfo
from app.core.db import get_db_session
from app.models.job import Job
from app.services.message_service import MessageService


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


class JobService:
    """In-process async job runner with ORM-backed status."""

    _tasks: dict[str, asyncio.Task[Any]] = {}

    @staticmethod
    def _row_to_job(obj: Job) -> dict[str, Any]:
        return {
            "id": obj.id,
            "connection_id": obj.connection_id,
            "job_type": obj.job_type,
            "status": obj.status,
            "progress": float(obj.progress or 0),
            "current": obj.current,
            "total": obj.total,
            "message": obj.message,
            "error": obj.error,
            "payload": obj.payload_json,
            "result": obj.result_json,
            "cancel_requested": bool(obj.cancel_requested),
            "created_at": obj.created_at,
            "started_at": obj.started_at,
            "completed_at": obj.completed_at,
        }

    @staticmethod
    def create_job(connection_id: str, job_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        job_id = str(uuid.uuid4())
        created_at = _now_iso()

        with get_db_session() as session:
            job = Job(
                id=job_id,
                connection_id=connection_id,
                job_type=job_type,
                status="pending",
                progress=0,
                payload_json=payload,
                created_at=created_at,
            )
            session.add(job)
            session.flush()
            session.refresh(job)
            return JobService._row_to_job(job)

    @staticmethod
    def get_job(job_id: str, connection_id: str | None = None) -> dict[str, Any] | None:
        with get_db_session() as session:
            query = session.query(Job).filter(Job.id == job_id)
            if connection_id:
                query = query.filter(Job.connection_id == connection_id)
            job = query.first()
            return JobService._row_to_job(job) if job else None

    @staticmethod
    def list_jobs(connection_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with get_db_session() as session:
            jobs = (
                session.query(Job)
                .filter(Job.connection_id == connection_id)
                .order_by(Job.created_at.desc())
                .limit(limit)
                .all()
            )
            return [JobService._row_to_job(j) for j in jobs]

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
        with get_db_session() as session:
            job = session.query(Job).filter(Job.id == job_id).first()
            if job is None:
                return
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = progress
            if current is not None:
                job.current = current
            if total is not None:
                job.total = total
            if message is not None:
                job.message = message
            if error is not None:
                job.error = error
            if result is not None:
                job.result_json = result
            if started_at is not None:
                job.started_at = started_at
            if completed_at is not None:
                job.completed_at = completed_at

    @staticmethod
    def cancel_job(job_id: str, connection_id: str) -> dict[str, Any] | None:
        with get_db_session() as session:
            job = (
                session.query(Job)
                .filter(Job.id == job_id, Job.connection_id == connection_id)
                .first()
            )
            if job is None:
                return None
            job.cancel_requested = 1
            session.flush()
            result = JobService._row_to_job(job)

        task = JobService._tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        return result

    @staticmethod
    def _is_cancel_requested(job_id: str) -> bool:
        with get_db_session() as session:
            val = session.query(Job.cancel_requested).filter(Job.id == job_id).scalar()
            return bool(val)

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
