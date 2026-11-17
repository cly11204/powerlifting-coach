"""Database helpers shared by the routers: lookups, serialisation, record loading."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.config import get_settings
from app.services.strength import SetRecord, set_e1rm


def get_or_404(db: Session, model, obj_id: int, label: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{label} {obj_id} not found")
    return obj


def require_exercise(db: Session, exercise_id: int) -> models.Exercise:
    ex = db.get(models.Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status_code=422, detail=f"Exercise {exercise_id} does not exist")
    return ex


def to_record(s: models.ExerciseSet, sess: models.WorkoutSession | None = None) -> SetRecord:
    sess = sess or s.session
    return SetRecord(
        performed_on=sess.session_date,
        exercise_id=s.exercise_id,
        exercise_name=s.exercise.name,
        category=s.exercise.category,
        weight_kg=s.weight_kg,
        reps=s.reps,
        rpe=s.rpe,
        set_type=s.set_type,
        completed=s.completed,
        session_id=sess.id,
    )


def set_out(s: models.ExerciseSet) -> schemas.SetOut:
    max_reps = get_settings().e1rm_max_reps
    return schemas.SetOut(
        id=s.id,
        session_id=s.session_id,
        exercise_id=s.exercise_id,
        exercise_name=s.exercise.name,
        set_order=s.set_order,
        weight_kg=s.weight_kg,
        reps=s.reps,
        rpe=s.rpe,
        set_type=s.set_type,
        completed=s.completed,
        rest_seconds=s.rest_seconds,
        notes=s.notes,
        e1rm_kg=set_e1rm(to_record(s), max_reps),
    )


def _summary_fields(sess: models.WorkoutSession) -> dict:
    names: list[str] = []
    for s in sess.sets:
        if s.exercise.name not in names:
            names.append(s.exercise.name)
    volume = sum(s.weight_kg * s.reps for s in sess.sets if s.completed and s.set_type != "warmup")
    return dict(
        id=sess.id,
        athlete_id=sess.athlete_id,
        title=sess.title,
        started_at=sess.started_at,
        duration_minutes=sess.duration_minutes,
        notes=sess.notes,
        set_count=len(sess.sets),
        exercise_names=names,
        volume_kg=round(volume, 1),
    )


def session_summary(sess: models.WorkoutSession) -> schemas.SessionSummary:
    return schemas.SessionSummary(**_summary_fields(sess))


def session_out(sess: models.WorkoutSession) -> schemas.SessionOut:
    return schemas.SessionOut(**_summary_fields(sess), sets=[set_out(s) for s in sess.sets])


def load_session(db: Session, session_id: int) -> models.WorkoutSession:
    sess = db.scalar(
        select(models.WorkoutSession)
        .where(models.WorkoutSession.id == session_id)
        .options(selectinload(models.WorkoutSession.sets).selectinload(models.ExerciseSet.exercise))
        # Re-read from the DB so returned values are exactly what was stored (e.g. UTC times).
        .execution_options(populate_existing=True)
    )
    if sess is None:
        raise HTTPException(status_code=404, detail=f"Workout session {session_id} not found")
    return sess


def athlete_records(
    db: Session, athlete_id: int, exercise_id: int | None = None, category: str | None = None
) -> list[SetRecord]:
    """All of an athlete's sets as SetRecords, oldest first."""
    q = (
        select(models.ExerciseSet, models.WorkoutSession)
        .join(models.WorkoutSession, models.ExerciseSet.session_id == models.WorkoutSession.id)
        .join(models.Exercise, models.ExerciseSet.exercise_id == models.Exercise.id)
        .where(models.WorkoutSession.athlete_id == athlete_id)
        .options(selectinload(models.ExerciseSet.exercise))
        .order_by(models.WorkoutSession.session_date, models.WorkoutSession.started_at, models.ExerciseSet.set_order)
    )
    if exercise_id is not None:
        q = q.where(models.ExerciseSet.exercise_id == exercise_id)
    if category is not None:
        q = q.where(models.Exercise.category == category)
    return [to_record(s, sess) for s, sess in db.execute(q).all()]
