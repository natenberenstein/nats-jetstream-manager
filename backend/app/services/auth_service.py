"""Authentication, users, and invitation service."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

from app.core.config import settings
from app.core.db import get_db_connection


@dataclass
class AuthUser:
    id: int
    email: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: str
    updated_at: str


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _hash_password(password: str, salt: bytes | None = None) -> str:
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"{salt.hex()}:{digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        salt_hex, digest_hex = encoded.split(":", 1)
    except ValueError:
        return False
    calc = _hash_password(password, bytes.fromhex(salt_hex)).split(":", 1)[1]
    return hmac.compare_digest(calc, digest_hex)


def _row_to_user(row: Any) -> AuthUser:
    return AuthUser(
        id=int(row["id"]),
        email=str(row["email"]),
        full_name=row["full_name"],
        role=str(row["role"]),
        is_active=bool(row["is_active"]),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


class AuthService:
    @staticmethod
    def has_users() -> bool:
        with get_db_connection() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()
            return bool(row and int(row["c"]) > 0)

    @staticmethod
    def _users_count(conn) -> int:
        row = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()
        return int(row["c"]) if row else 0

    @staticmethod
    def create_user(email: str, password: str, full_name: str | None, role: str | None = None) -> AuthUser:
        normalized_email = email.strip().lower()
        now = _iso(_utcnow())
        with get_db_connection() as conn:
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (normalized_email,)).fetchone()
            if existing:
                raise ValueError("Email already registered")

            assigned_role = role or ("admin" if AuthService._users_count(conn) == 0 else "viewer")
            password_hash = _hash_password(password)
            cur = conn.execute(
                """
                INSERT INTO users (email, password_hash, full_name, role, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (normalized_email, password_hash, full_name, assigned_role, now, now),
            )
            user_id = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row is None:
                raise RuntimeError("Failed to create user")
            return _row_to_user(row)

    @staticmethod
    def authenticate(email: str, password: str) -> AuthUser | None:
        normalized_email = email.strip().lower()
        with get_db_connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (normalized_email,)).fetchone()
            if row is None or not bool(row["is_active"]):
                return None
            if not _verify_password(password, str(row["password_hash"])):
                return None
            return _row_to_user(row)

    @staticmethod
    def create_session(user_id: int) -> dict[str, str]:
        token = secrets.token_urlsafe(48)
        now = _utcnow()
        expires_at = now + timedelta(hours=settings.session_ttl_hours)
        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO sessions (user_id, token, expires_at, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, token, _iso(expires_at), _iso(now), _iso(now)),
            )
            conn.commit()
        return {"token": token, "expires_at": _iso(expires_at)}

    @staticmethod
    def get_user_by_session_token(token: str) -> AuthUser | None:
        now = _iso(_utcnow())
        with get_db_connection() as conn:
            row = conn.execute(
                """
                SELECT u.*
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1
                """,
                (token, now),
            ).fetchone()
            if row is None:
                return None
            conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", (now, token))
            conn.commit()
            return _row_to_user(row)

    @staticmethod
    def revoke_session(token: str) -> None:
        with get_db_connection() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()

    @staticmethod
    def update_profile(user_id: int, full_name: str | None) -> AuthUser:
        now = _iso(_utcnow())
        with get_db_connection() as conn:
            conn.execute(
                "UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?",
                (full_name, now, user_id),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row is None:
                raise ValueError("User not found")
            conn.commit()
            return _row_to_user(row)

    @staticmethod
    def list_users() -> list[dict[str, Any]]:
        with get_db_connection() as conn:
            rows = conn.execute(
                "SELECT id, email, full_name, role, is_active, created_at, updated_at FROM users ORDER BY email"
            ).fetchall()
            return [dict(row) for row in rows]

    @staticmethod
    def update_user_role(user_id: int, role: str) -> dict[str, Any]:
        if role not in {"admin", "viewer"}:
            raise ValueError("Invalid role")
        now = _iso(_utcnow())
        with get_db_connection() as conn:
            conn.execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", (role, now, user_id))
            row = conn.execute(
                "SELECT id, email, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            if row is None:
                raise ValueError("User not found")
            conn.commit()
            return dict(row)

    @staticmethod
    def create_invite(
        email: str,
        role: str,
        invited_by_user_id: int,
        cluster_name: str | None = None,
        expires_hours: int | None = None,
    ) -> dict[str, Any]:
        if role not in {"admin", "viewer"}:
            raise ValueError("Invalid role")

        normalized_email = email.strip().lower()
        ttl = expires_hours if expires_hours and expires_hours > 0 else settings.invite_ttl_hours
        now = _utcnow()
        expires_at = now + timedelta(hours=ttl)
        token = secrets.token_urlsafe(40)

        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO invites (email, role, token, invited_by_user_id, cluster_name, status, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (
                    normalized_email,
                    role,
                    token,
                    invited_by_user_id,
                    cluster_name,
                    _iso(expires_at),
                    _iso(now),
                ),
            )
            row = conn.execute(
                "SELECT id, email, role, token, invited_by_user_id, cluster_name, status, expires_at, accepted_at, created_at FROM invites WHERE token = ?",
                (token,),
            ).fetchone()
            conn.commit()

        if row is None:
            raise RuntimeError("Failed to create invite")

        invite = dict(row)
        AuthService._send_invite_email(invite)
        invite["invite_url"] = f"{settings.app_base_url.rstrip('/')}/accept-invite?token={token}"
        return invite

    @staticmethod
    def list_invites() -> list[dict[str, Any]]:
        now = _iso(_utcnow())
        with get_db_connection() as conn:
            conn.execute(
                "UPDATE invites SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?",
                (now,),
            )
            rows = conn.execute(
                "SELECT id, email, role, token, invited_by_user_id, cluster_name, status, expires_at, accepted_at, created_at FROM invites ORDER BY created_at DESC"
            ).fetchall()
            conn.commit()
            return [dict(row) for row in rows]

    @staticmethod
    def accept_invite(token: str, password: str, full_name: str | None) -> dict[str, Any]:
        now = _utcnow()
        now_iso = _iso(now)

        with get_db_connection() as conn:
            row = conn.execute(
                "SELECT * FROM invites WHERE token = ?",
                (token,),
            ).fetchone()
            if row is None:
                raise ValueError("Invalid invite token")

            if row["status"] != "pending":
                raise ValueError("Invite is no longer active")

            if str(row["expires_at"]) <= now_iso:
                conn.execute("UPDATE invites SET status = 'expired' WHERE id = ?", (row["id"],))
                conn.commit()
                raise ValueError("Invite has expired")

            email = str(row["email"])
            role = str(row["role"])

            existing_user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if existing_user:
                user_id = int(existing_user["id"])
                conn.execute(
                    "UPDATE users SET password_hash = ?, full_name = COALESCE(?, full_name), role = ?, updated_at = ? WHERE id = ?",
                    (_hash_password(password), full_name, role, now_iso, user_id),
                )
            else:
                cur = conn.execute(
                    """
                    INSERT INTO users (email, password_hash, full_name, role, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?, ?)
                    """,
                    (email, _hash_password(password), full_name, role, now_iso, now_iso),
                )
                user_id = int(cur.lastrowid)

            conn.execute(
                "UPDATE invites SET status = 'accepted', accepted_at = ? WHERE id = ?",
                (now_iso, row["id"]),
            )

            user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            conn.commit()

        if user_row is None:
            raise RuntimeError("Failed to accept invite")

        user = _row_to_user(user_row)
        session = AuthService.create_session(user.id)
        return {
            "user": AuthService.serialize_user(user),
            "token": session["token"],
            "expires_at": session["expires_at"],
        }

    @staticmethod
    def serialize_user(user: AuthUser) -> dict[str, Any]:
        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }

    @staticmethod
    def _send_invite_email(invite: dict[str, Any]) -> None:
        invite_url = f"{settings.app_base_url.rstrip('/')}/accept-invite?token={invite['token']}"

        if not settings.smtp_host:
            # No SMTP configured, invite remains retrievable via API/UI.
            return

        message = EmailMessage()
        message["From"] = settings.invite_from_email
        message["To"] = invite["email"]
        message["Subject"] = "You are invited to NATS JetStream Manager"
        message.set_content(
            "\n".join(
                [
                    "You have been invited to NATS JetStream Manager.",
                    f"Role: {invite['role']}",
                    f"Cluster: {invite.get('cluster_name') or 'default'}",
                    f"Accept invitation: {invite_url}",
                    f"Expires at: {invite['expires_at']}",
                ]
            )
        )

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
