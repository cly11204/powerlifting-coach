"""The Alembic migrations must build exactly the schema described by models.py."""
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.database import Base
from app.main import run_migrations


def test_migrations_match_models(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrate.db'}"
    run_migrations(url)
    engine = create_engine(url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    # Ignore type-only differences caused by our UTCDateTime wrapper.
    diff = [d for d in diff if not (isinstance(d, list) and d and d[0][0] == "modify_type")]
    assert diff == [], diff
    assert {"athletes", "workout_sessions", "exercise_sets", "daily_metrics",
            "competition_goals", "strength_predictions", "exercises"} <= set(inspect(engine).get_table_names())
