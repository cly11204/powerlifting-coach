"""Alembic migration environment.

Create a new migration after changing models.py:
    alembic revision --autogenerate -m "describe change"
Apply migrations:
    alembic upgrade head
"""
import os

from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.database import Base

config = context.config
# Priority: explicitly set URL (tests / run_migrations) > DATABASE_URL env > alembic.ini
if os.getenv("DATABASE_URL") and config.get_main_option("sqlalchemy.url") == "sqlite:///./powerlifting.db":
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    # Store our UTC wrapper as a plain DateTime column in migrations.
    if type_ == "type" and isinstance(obj, models.UTCDateTime):
        return "sa.DateTime()"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # lets SQLite handle ALTER TABLE via table rebuilds
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
