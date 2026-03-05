"""Authentication, users, and invitation service."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import smtplib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any

from sqlalchemy import func

from app.core.config import settings
from app.core.db import get_db_session, row_to_dict
from app.models.user import Invite, User, UserSession


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
    return datetime.now(tz=UTC)


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


def _orm_to_user(obj: User) -> AuthUser:
    return AuthUser(
        id=int(obj.id),
        email=str(obj.email),
        full_name=obj.full_name,
        role=str(obj.role),
        is_active=bool(obj.is_active),
        created_at=str(obj.created_at),
        updated_at=str(obj.updated_at),
    )


class AuthService:
    @staticmethod
    def has_users() -> bool:
        with get_db_session() as session:
            count = session.query(func.count(User.id)).scalar()
            return bool(count and count > 0)

    @staticmethod
    def _users_count(session) -> int:
        return session.query(func.count(User.id)).scalar() or 0

    @staticmethod
    def create_user(email: str, password: str, full_name: str | None, role: str | None = None) -> AuthUser:
        normalized_email = email.strip().lower()
        now = _iso(_utcnow())
        with get_db_session() as session:
            existing = session.query(User).filter(User.email == normalized_email).first()
            if existing:
                raise ValueError("Email already registered")

            assigned_role = role or ("admin" if AuthService._users_count(session) == 0 else "viewer")
            password_hash = _hash_password(password)
            user = User(
                email=normalized_email,
                password_hash=password_hash,
                full_name=full_name,
                role=assigned_role,
                is_active=1,
                created_at=now,
                updated_at=now,
            )
            session.add(user)
            session.flush()
            session.refresh(user)
            return _orm_to_user(user)

    @staticmethod
    def authenticate(email: str, password: str) -> AuthUser | None:
        normalized_email = email.strip().lower()
        with get_db_session() as session:
            user = session.query(User).filter(User.email == normalized_email).first()
            if user is None or not bool(user.is_active):
                return None
            if not _verify_password(password, str(user.password_hash)):
                return None
            return _orm_to_user(user)

    @staticmethod
    def create_session(user_id: int) -> dict[str, str]:
        token = secrets.token_urlsafe(48)
        now = _utcnow()
        expires_at = now + timedelta(hours=settings.session_ttl_hours)
        with get_db_session() as session:
            sess = UserSession(
                user_id=user_id,
                token=token,
                expires_at=_iso(expires_at),
                created_at=_iso(now),
                last_seen_at=_iso(now),
            )
            session.add(sess)
        return {"token": token, "expires_at": _iso(expires_at)}

    @staticmethod
    def get_user_by_session_token(token: str) -> AuthUser | None:
        now = _iso(_utcnow())
        with get_db_session() as session:
            user = (
                session.query(User)
                .join(UserSession, UserSession.user_id == User.id)
                .filter(
                    UserSession.token == token,
                    UserSession.expires_at > now,
                    User.is_active == 1,
                )
                .first()
            )
            if user is None:
                return None
            session.query(UserSession).filter(UserSession.token == token).update(
                {"last_seen_at": now}
            )
            return _orm_to_user(user)

    @staticmethod
    def revoke_session(token: str) -> None:
        with get_db_session() as session:
            session.query(UserSession).filter(UserSession.token == token).delete()

    @staticmethod
    def update_profile(user_id: int, full_name: str | None) -> AuthUser:
        now = _iso(_utcnow())
        with get_db_session() as session:
            user = session.query(User).filter(User.id == user_id).first()
            if user is None:
                raise ValueError("User not found")
            user.full_name = full_name
            user.updated_at = now
            session.flush()
            return _orm_to_user(user)

    @staticmethod
    def list_users() -> list[dict[str, Any]]:
        with get_db_session() as session:
            users = session.query(User).order_by(User.email).all()
            return [
                {
                    "id": u.id,
                    "email": u.email,
                    "full_name": u.full_name,
                    "role": u.role,
                    "is_active": u.is_active,
                    "created_at": u.created_at,
                    "updated_at": u.updated_at,
                }
                for u in users
            ]

    @staticmethod
    def update_user_role(user_id: int, role: str) -> dict[str, Any]:
        if role not in {"admin", "viewer"}:
            raise ValueError("Invalid role")
        now = _iso(_utcnow())
        with get_db_session() as session:
            user = session.query(User).filter(User.id == user_id).first()
            if user is None:
                raise ValueError("User not found")
            user.role = role
            user.updated_at = now
            session.flush()
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

        with get_db_session() as session:
            invite = Invite(
                email=normalized_email,
                role=role,
                token=token,
                invited_by_user_id=invited_by_user_id,
                cluster_name=cluster_name,
                status="pending",
                expires_at=_iso(expires_at),
                created_at=_iso(now),
            )
            session.add(invite)
            session.flush()
            invite_dict = row_to_dict(invite)

        if invite_dict is None:
            raise RuntimeError("Failed to create invite")

        AuthService._send_invite_email(invite_dict)
        invite_dict["invite_url"] = f"{settings.app_base_url.rstrip('/')}/accept-invite?token={token}"
        return invite_dict

    @staticmethod
    def list_invites() -> list[dict[str, Any]]:
        now = _iso(_utcnow())
        with get_db_session() as session:
            session.query(Invite).filter(
                Invite.status == "pending",
                Invite.expires_at <= now,
            ).update({"status": "expired"})
            invites = session.query(Invite).order_by(Invite.created_at.desc()).all()
            return [row_to_dict(inv) for inv in invites]

    @staticmethod
    def accept_invite(token: str, password: str, full_name: str | None) -> dict[str, Any]:
        now = _utcnow()
        now_iso = _iso(now)

        with get_db_session() as session:
            invite = session.query(Invite).filter(Invite.token == token).first()
            if invite is None:
                raise ValueError("Invalid invite token")

            if invite.status != "pending":
                raise ValueError("Invite is no longer active")

            if str(invite.expires_at) <= now_iso:
                invite.status = "expired"
                raise ValueError("Invite has expired")

            email = str(invite.email)
            role = str(invite.role)

            existing_user = session.query(User).filter(User.email == email).first()
            if existing_user:
                existing_user.password_hash = _hash_password(password)
                if full_name is not None:
                    existing_user.full_name = full_name
                existing_user.role = role
                existing_user.updated_at = now_iso
                user_id = existing_user.id
            else:
                new_user = User(
                    email=email,
                    password_hash=_hash_password(password),
                    full_name=full_name,
                    role=role,
                    is_active=1,
                    created_at=now_iso,
                    updated_at=now_iso,
                )
                session.add(new_user)
                session.flush()
                user_id = new_user.id

            invite.status = "accepted"
            invite.accepted_at = now_iso

            user = session.query(User).filter(User.id == user_id).first()
            if user is None:
                raise RuntimeError("Failed to accept invite")
            auth_user = _orm_to_user(user)

        session_data = AuthService.create_session(auth_user.id)
        return {
            "user": AuthService.serialize_user(auth_user),
            "token": session_data["token"],
            "expires_at": session_data["expires_at"],
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
