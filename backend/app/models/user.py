from __future__ import annotations

from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    full_name: Mapped[str | None]
    role: Mapped[str]
    is_active: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[str]
    updated_at: Mapped[str]


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[str]
    created_at: Mapped[str]
    last_seen_at: Mapped[str]


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str]
    role: Mapped[str]
    token: Mapped[str] = mapped_column(unique=True)
    invited_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cluster_name: Mapped[str | None]
    status: Mapped[str] = mapped_column(default="pending")
    expires_at: Mapped[str]
    accepted_at: Mapped[str | None]
    created_at: Mapped[str]


Index("idx_sessions_token", UserSession.token)
Index("idx_invites_token", Invite.token)
Index("idx_invites_email", Invite.email)
