"""Athlete profile and competition goal endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import get_or_404
from app.database import get_db
from app.models import utcnow

router = APIRouter(prefix="/api/athletes", tags=["athletes"])


@router.get("", response_model=list[schemas.AthleteOut])
def list_athletes(db: Session = Depends(get_db)):
    return db.scalars(select(models.Athlete).order_by(models.Athlete.is_demo, models.Athlete.id)).all()


@router.post("", response_model=schemas.AthleteOut, status_code=201)
def create_athlete(payload: schemas.AthleteCreate, db: Session = Depends(get_db)):
    athlete = models.Athlete(**payload.model_dump(), is_demo=False)
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


@router.get("/{athlete_id}", response_model=schemas.AthleteOut)
def get_athlete(athlete_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Athlete, athlete_id, "Athlete")


@router.patch("/{athlete_id}", response_model=schemas.AthleteOut)
def update_athlete(athlete_id: int, payload: schemas.AthleteUpdate, db: Session = Depends(get_db)):
    athlete = get_or_404(db, models.Athlete, athlete_id, "Athlete")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is None and k in {"name", "sex", "federation", "division", "equipment", "weight_class_kg", "preferred_unit"}:
            raise HTTPException(status_code=422, detail=f"{k} cannot be empty")
        setattr(athlete, k, v)
    db.commit()
    db.refresh(athlete)
    return athlete


@router.delete("/{athlete_id}", status_code=204)
def delete_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_or_404(db, models.Athlete, athlete_id, "Athlete")
    db.delete(athlete)
    db.commit()


# ---- Competition goal (one active goal per athlete in the MVP) ----
def _current_goal(db: Session, athlete_id: int) -> models.CompetitionGoal | None:
    return db.scalar(
        select(models.CompetitionGoal)
        .where(models.CompetitionGoal.athlete_id == athlete_id)
        .order_by(models.CompetitionGoal.id.desc())
    )


@router.get("/{athlete_id}/goal", response_model=schemas.GoalOut | None)
def get_goal(athlete_id: int, db: Session = Depends(get_db)):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    return _current_goal(db, athlete_id)


@router.put("/{athlete_id}/goal", response_model=schemas.GoalOut)
def upsert_goal(athlete_id: int, payload: schemas.GoalUpsert, db: Session = Depends(get_db)):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    goal = _current_goal(db, athlete_id)
    data = payload.model_dump()
    if goal is None:
        goal = models.CompetitionGoal(athlete_id=athlete_id)
        db.add(goal)
    was_verified = goal.verification_status == "verified"
    standard_changed = (
        goal.qualifying_total_kg != data["qualifying_total_kg"]
        or goal.qualifying_source != data["qualifying_source"]
    )
    for k, v in data.items():
        setattr(goal, k, v)
    if goal.verification_status == "verified":
        if not was_verified or standard_changed:
            goal.verified_at = utcnow()
    else:
        goal.verified_at = None
    db.commit()
    db.refresh(goal)
    return goal
