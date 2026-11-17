import os

os.environ["AUTO_MIGRATE"] = "false"  # tests build their own throwaway databases

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db, make_engine
from app.main import app
from app.seed_catalog import ensure_default_exercises


@pytest.fixture()
def db_session():
    engine = make_engine("sqlite://", poolclass=StaticPool)  # fresh in-memory DB per test
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with TestSession() as db:
        ensure_default_exercises(db)
    yield TestSession
    engine.dispose()


@pytest.fixture()
def client(db_session):
    def _get_db():
        db = db_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


PROFILE = {
    "name": "Test Lifter",
    "sex": "F",
    "federation": "USAPL",
    "division": "Open",
    "equipment": "raw",
    "weight_class_kg": 60,
    "meet_name": "Test Meet",
    "meet_date": "2027-02-07",
}


@pytest.fixture()
def athlete(client):
    r = client.post("/api/athletes", json=PROFILE)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def exercise_ids(client):
    return {e["name"]: e["id"] for e in client.get("/api/exercises").json()}
