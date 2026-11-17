"""Workout sessions, exercise sets and the exercise catalogue."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.crud import get_or_404, load_session, require_exercise, session_out, session_summary, set_out
from app.database import get_db

router = APIRouter(prefix="/api", tags=["workouts"])


# ---------------- Exercises ----------------
@router.get("/exercises", response_model=list[schemas.ExerciseOut])
def list_exercises(db: Session = Depends(get_db)):
    return db.scalars(
        select(models.Exercise).order_by(
            models.Exercise.is_competition_lift.desc(), models.Exercise.category, models.Exercise.name
        )
    ).all()


@router.post("/exercises", response_model=schemas.ExerciseOut, status_code=201)
def create_exercise(payload: schemas.ExerciseCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    clash = db.scalar(select(models.Exercise).where(func.lower(models.Exercise.name) == name.lower()))
    if clash:
        raise HTTPException(status_code=409, detail=f"Exercise '{clash.name}' already exists")
    ex = models.Exercise(name=name, category=payload.category, is_competition_lift=payload.is_competition_lift)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


# ---------------- Sessions ----------------
@router.get("/athletes/{athlete_id}/sessions", response_model=list[schemas.SessionSummary])
def list_sessions(
    athlete_id: int,
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    q = (
        select(models.WorkoutSession)
        .where(models.WorkoutSession.athlete_id == athlete_id)
        .options(selectinload(models.WorkoutSession.sets).selectinload(models.ExerciseSet.exercise))
        .order_by(models.WorkoutSession.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if start:
        q = q.where(models.WorkoutSession.session_date >= start)
    if end:
        q = q.where(models.WorkoutSession.session_date <= end)
    return [session_summary(s) for s in db.scalars(q).all()]


def _next_order(sess: models.WorkoutSession) -> int:
    return max((s.set_order for s in sess.sets), default=-1) + 1


@router.post("/athletes/{athlete_id}/sessions", response_model=schemas.SessionOut, status_code=201)
def create_session(athlete_id: int, payload: schemas.SessionCreate, db: Session = Depends(get_db)):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    sess = models.WorkoutSession(
        athlete_id=athlete_id,
        title=payload.title,
        started_at=payload.started_at,
        session_date=payload.started_at.date(),  # local date, from the client's offset
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )
    for i, s in enumerate(payload.sets):
        require_exercise(db, s.exercise_id)
        data = s.model_dump()
        data["set_order"] = data["set_order"] if data["set_order"] is not None else i
        sess.sets.append(models.ExerciseSet(**data))
    db.add(sess)
    db.commit()
    return session_out(load_session(db, sess.id))


@router.get("/sessions/{session_id}", response_model=schemas.SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db)):
    return session_out(load_session(db, session_id))


@router.patch("/sessions/{session_id}", response_model=schemas.SessionOut)
def update_session(session_id: int, payload: schemas.SessionUpdate, db: Session = Depends(get_db)):
    sess = load_session(db, session_id)
    data = payload.model_dump(exclude_unset=True)
    if "started_at" in data:
        if data["started_at"] is None:
            raise HTTPException(status_code=422, detail="started_at cannot be empty")
        sess.session_date = data["started_at"].date()
    for k, v in data.items():
        setattr(sess, k, v)
    db.commit()
    return session_out(load_session(db, session_id))


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    sess = get_or_404(db, models.WorkoutSession, session_id, "Workout session")
    db.delete(sess)
    db.commit()
    return Response(status_code=204)


# ---------------- Sets ----------------
@router.post("/sessions/{session_id}/sets", response_model=schemas.SetOut, status_code=201)
def add_set(session_id: int, payload: schemas.SetCreate, db: Session = Depends(get_db)):
    sess = load_session(db, session_id)
    require_exercise(db, payload.exercise_id)
    data = payload.model_dump()
    if data["set_order"] is None:
        data["set_order"] = _next_order(sess)
    s = models.ExerciseSet(session_id=session_id, **data)
    db.add(s)
    db.commit()
    db.refresh(s)
    return set_out(s)


@router.patch("/sets/{set_id}", response_model=schemas.SetOut)
def update_set(set_id: int, payload: schemas.SetUpdate, db: Session = Depends(get_db)):
    s = get_or_404(db, models.ExerciseSet, set_id, "Set")
    data = payload.model_dump(exclude_unset=True)
    for required in ("exercise_id", "weight_kg", "reps", "set_type", "completed", "set_order"):
        if required in data and data[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} cannot be empty")
    if "exercise_id" in data:
        require_exercise(db, data["exercise_id"])
    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return set_out(s)


@router.delete("/sets/{set_id}", status_code=204)
def delete_set(set_id: int, db: Session = Depends(get_db)):
    s = get_or_404(db, models.ExerciseSet, set_id, "Set")
    db.delete(s)
    db.commit()
    return Response(status_code=204)


# ---------------- Previous performance ----------------
@router.get(
    "/athletes/{athlete_id}/exercises/{exercise_id}/previous",
    response_model=schemas.PreviousPerformance,
)
def previous_performance(
    athlete_id: int,
    exercise_id: int,
    before_session_id: int | None = Query(None, description="Ignore this session (e.g. the one in progress)"),
    db: Session = Depends(get_db),
):
    """Sets from the most recent *other* session that included this exercise."""
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    require_exercise(db, exercise_id)
    q = (
        select(models.WorkoutSession)
        .join(models.ExerciseSet)
        .where(models.WorkoutSession.athlete_id == athlete_id, models.ExerciseSet.exercise_id == exercise_id)
        .order_by(models.WorkoutSession.started_at.desc())
        .limit(1)
    )
    if before_session_id is not None:
        q = q.where(models.WorkoutSession.id != before_session_id)
    sess = db.scalar(q)
    if sess is None:
        return schemas.PreviousPerformance(exercise_id=exercise_id, session_id=None, started_at=None, sets=[])
    sess = load_session(db, sess.id)
    return schemas.PreviousPerformance(
        exercise_id=exercise_id,
        session_id=sess.id,
        started_at=sess.started_at,
        sets=[set_out(s) for s in sess.sets if s.exercise_id == exercise_id],
    )
