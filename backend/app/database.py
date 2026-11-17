"""Database engine and session management.

Unit + time conventions (applies to the whole schema):
  * All weights are stored in KILOGRAMS (columns end in `_kg`).
  * All timestamps are stored in UTC. SQLite has no timezone type, so we
    normalise to UTC on the way in and re-attach UTC on the way out
    (see `UTCDateTime` in models.py).
  * Calendar days (e.g. daily metrics, meet date) are plain DATEs.
"""
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str, **kwargs):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, **kwargs)
    if url.startswith("sqlite"):
        # SQLite ignores foreign keys unless this pragma is on for each connection.
        @event.listens_for(engine, "connect")
        def _fk_pragma(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
