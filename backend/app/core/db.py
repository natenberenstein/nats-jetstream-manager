"""SQLite persistence for users, sessions, and invitations."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.core.config import settings


def _db_path() -> Path:
    path = Path(settings.database_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_db_connection()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
                token TEXT NOT NULL UNIQUE,
                invited_by_user_id INTEGER,
                cluster_name TEXT,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'expired', 'revoked')),
                expires_at TEXT NOT NULL,
                accepted_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
            CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
            CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);

            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                connection_id TEXT,
                job_type TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
                progress REAL NOT NULL DEFAULT 0,
                current INTEGER,
                total INTEGER,
                message TEXT,
                error TEXT,
                payload_json TEXT,
                result_json TEXT,
                cancel_requested INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_connection_id ON jobs(connection_id);
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

            CREATE TABLE IF NOT EXISTS stream_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                connection_id TEXT NOT NULL,
                stream_name TEXT NOT NULL,
                messages INTEGER NOT NULL DEFAULT 0,
                bytes INTEGER NOT NULL DEFAULT 0,
                consumer_count INTEGER NOT NULL DEFAULT 0,
                collected_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_stream_metrics_conn_stream
                ON stream_metrics(connection_id, stream_name, collected_at);

            CREATE TABLE IF NOT EXISTS connection_health (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                connection_id TEXT NOT NULL,
                url TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('up', 'down')),
                jetstream_ok INTEGER NOT NULL DEFAULT 1,
                error TEXT,
                checked_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_connection_health_conn
                ON connection_health(connection_id, checked_at);

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                user_email TEXT,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_name TEXT,
                connection_id TEXT,
                details_json TEXT,
                ip_address TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
            CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
            CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON audit_log(resource_type);
            """
        )
        conn.commit()
    finally:
        conn.close()
