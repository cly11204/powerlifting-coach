"""FastAPI application entry point.

Run with:  uvicorn app.main:app --reload
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.database import SessionLocal
from app.routers import analytics, athletes, demo, metrics, workouts
from app.seed_catalog import ensure_default_exercises

BACKEND_DIR = Path(__file__).resolve().parent.parent


def run_migrations(database_url: str) -> None:
    """Apply Alembic migrations up to the latest version."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.auto_migrate:
        run_migrations(settings.database_url)
        with SessionLocal() as db:
            ensure_default_exercises(db)
    yield


app = FastAPI(title="Powerlifting Coach API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_: Request, exc: IntegrityError):
    """Turn database constraint violations into a clear 409 instead of a 500."""
    return JSONResponse(status_code=409, content={"detail": f"Database constraint violated: {exc.orig}"})


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


for r in (athletes.router, workouts.router, metrics.router, analytics.router, demo.router):
    app.include_router(r)
