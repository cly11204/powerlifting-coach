"""Daily nutrition, body weight and recovery metrics (one row per day)."""
from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import get_or_404
from app.database import get_db

router = APIRouter(prefix="/api", tags=["daily metrics"])


@router.get("/athletes/{athlete_id}/metrics", response_model=list[schemas.MetricOut])
def list_metrics(
    athlete_id: int, start: date | None = None, end: date | None = None, db: Session = Depends(get_db)
):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    q = select(models.DailyMetric).where(models.DailyMetric.athlete_id == athlete_id)
    if start:
        q = q.where(models.DailyMetric.date >= start)
    if end:
        q = q.where(models.DailyMetric.date <= end)
    return db.scalars(q.order_by(models.DailyMetric.date.desc())).all()


@router.get("/athletes/{athlete_id}/metrics/{day}", response_model=schemas.MetricOut | None)
def get_metric(athlete_id: int, day: date, db: Session = Depends(get_db)):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    return db.scalar(
        select(models.DailyMetric).where(models.DailyMetric.athlete_id == athlete_id, models.DailyMetric.date == day)
    )


@router.put("/athletes/{athlete_id}/metrics/{day}", response_model=schemas.MetricOut)
def upsert_metric(athlete_id: int, day: date, payload: schemas.MetricUpsert, db: Session = Depends(get_db)):
    """Create or replace the entry for a given day. Omitted fields are cleared."""
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    m = db.scalar(
        select(models.DailyMetric).where(models.DailyMetric.athlete_id == athlete_id, models.DailyMetric.date == day)
    )
    if m is None:
        m = models.DailyMetric(athlete_id=athlete_id, date=day)
        db.add(m)
    for k, v in payload.model_dump().items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/athletes/{athlete_id}/metrics/{day}", status_code=204)
def delete_metric(athlete_id: int, day: date, db: Session = Depends(get_db)):
    m = db.scalar(
        select(models.DailyMetric).where(models.DailyMetric.athlete_id == athlete_id, models.DailyMetric.date == day)
    )
    if m is not None:
        db.delete(m)
        db.commit()
    return Response(status_code=204)
