"""Database engine and session management via SQLAlchemy."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def _build_url() -> str:
    if settings.database_driver == "postgresql":
        return settings.database_url
    path = Path(settings.database_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path}"


def _make_engine():
    url = _build_url()
    kwargs = {}
    if settings.database_driver == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


engine = _make_engine()
SessionFactory = sessionmaker(bind=engine)


def row_to_dict(obj) -> dict:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


@contextmanager
def get_db_session():
    session = SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    from app.models import Base  # noqa: F401 — importing __init__ registers all models

    Base.metadata.create_all(engine)
