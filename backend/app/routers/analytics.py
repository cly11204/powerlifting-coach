"""Strength analytics endpoints: dashboard summary, per-exercise trends, volume, PRs."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.crud import athlete_records, get_or_404, require_exercise
from app.database import get_db
from app.services import strength as st

router = APIRouter(prefix="/api/athletes/{athlete_id}/analytics", tags=["analytics"])

COMP_LIFTS = ("squat", "bench", "deadlift")
CURRENT_WINDOW_DAYS = 42


# ---------------- Response models ----------------
class WeekPointOut(BaseModel):
    week_start: date
    best_e1rm_kg: float | None
    best_set_weight_kg: float | None
    best_set_reps: int | None
    best_set_precision: Literal["higher", "lower"] | None
    volume_kg: float
    working_sets: int
    rolling_avg_e1rm_kg: float | None
    change_vs_prev_kg: float | None
    change_vs_prev_pct: float | None


class RecordOut(BaseModel):
    value_kg: float
    weight_kg: float
    reps: int
    performed_on: date


class PRsOut(BaseModel):
    best_e1rm: RecordOut | None
    heaviest_single_set: RecordOut | None
    rep_maxes: dict[int, RecordOut]


class ExerciseAnalytics(BaseModel):
    exercise_id: int
    exercise_name: str
    category: str
    total_sets: int
    weeks: list[WeekPointOut]
    personal_records: PRsOut
    e1rm_max_reps: int


class PerformedExercise(BaseModel):
    exercise_id: int
    exercise_name: str
    category: str
    is_competition_lift: bool
    set_count: int
    last_performed: date
    best_e1rm_kg: float | None


class CurrentLift(BaseModel):
    lift: str
    e1rm_kg: float | None
    weight_kg: float | None = None
    reps: int | None = None
    precision: Literal["higher", "lower"] | None = None
    performed_on: date | None = None
    target_kg: float | None = None
    weeks_of_data: int = 0


class Qualification(BaseModel):
    threshold_kg: float | None
    source: str | None
    verification_status: str
    current_total_kg: float | None
    gap_kg: float | None
    percent_of_threshold: float | None
    note: str


class Forecast(BaseModel):
    available: bool
    reason: str


class VolumeWeekOut(BaseModel):
    week_start: date
    squat_kg: float
    bench_kg: float
    deadlift_kg: float
    accessory_kg: float
    total_sets: int


class DashboardOut(BaseModel):
    as_of: date
    meet_name: str | None
    meet_date: date | None
    days_to_meet: int | None
    current_window_days: int
    lifts: list[CurrentLift]
    estimated_total_kg: float | None
    target_total_kg: float | None
    qualification: Qualification
    forecast: Forecast
    sessions_last_7_days: int
    total_sessions: int
    weekly_volume: list[VolumeWeekOut]
    latest_body_weight_kg: float | None
    latest_body_weight_date: date | None


# ---------------- Helpers ----------------
def _comp_records(db: Session, athlete_id: int, lift: str) -> list[st.SetRecord]:
    """Sets of the *competition* version of a lift (variations would skew the estimate)."""
    comp_ids = set(
        db.scalars(
            select(models.Exercise.id).where(
                models.Exercise.category == lift, models.Exercise.is_competition_lift.is_(True)
            )
        )
    )
    return [r for r in athlete_records(db, athlete_id, category=lift) if r.exercise_id in comp_ids]


def _latest_goal(db: Session, athlete_id: int) -> models.CompetitionGoal | None:
    return db.scalar(
        select(models.CompetitionGoal)
        .where(models.CompetitionGoal.athlete_id == athlete_id)
        .order_by(models.CompetitionGoal.id.desc())
    )


def build_qualification(goal: models.CompetitionGoal | None, total: float | None) -> Qualification:
    threshold = goal.qualifying_total_kg if goal else None
    status = goal.verification_status if goal else "unverified"
    if threshold is None:
        note = "No qualifying standard entered. Add it in Profile after checking official USAPL requirements."
        return Qualification(
            threshold_kg=None, source=goal.qualifying_source if goal else None,
            verification_status=status, current_total_kg=total, gap_kg=None,
            percent_of_threshold=None, note=note,
        )
    gap = round(threshold - total, 1) if total is not None else None
    pct = round(100 * total / threshold, 1) if total is not None else None
    note = (
        "Comparison of your recent estimated total against the standard you entered. "
        "This is not a probability of qualifying."
    )
    if status != "verified":
        note = "Standard NOT yet verified against an official source. " + note
    if total is None:
        note = "Log the competition squat, bench and deadlift to compare against the standard. " + note
    return Qualification(
        threshold_kg=threshold, source=goal.qualifying_source, verification_status=status,
        current_total_kg=total, gap_kg=gap, percent_of_threshold=pct, note=note,
    )


# ---------------- Endpoints ----------------
@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    athlete_id: int,
    as_of: date | None = Query(None, description="Defaults to today (server date)"),
    db: Session = Depends(get_db),
):
    athlete = get_or_404(db, models.Athlete, athlete_id, "Athlete")
    as_of = as_of or date.today()
    max_reps = get_settings().e1rm_max_reps
    goal = _latest_goal(db, athlete_id)
    targets = {
        "squat": goal.target_squat_kg if goal else None,
        "bench": goal.target_bench_kg if goal else None,
        "deadlift": goal.target_deadlift_kg if goal else None,
    }

    lifts: list[CurrentLift] = []
    for lift in COMP_LIFTS:
        recs = _comp_records(db, athlete_id, lift)
        cur = st.current_estimate(recs, as_of, CURRENT_WINDOW_DAYS, max_reps)
        weeks = sum(1 for w in st.weekly_progression(recs, max_reps) if w.best_e1rm_kg is not None)
        lifts.append(
            CurrentLift(
                lift=lift,
                e1rm_kg=cur.e1rm_kg if cur else None,
                weight_kg=cur.weight_kg if cur else None,
                reps=cur.reps if cur else None,
                precision=cur.precision if cur else None,
                performed_on=cur.performed_on if cur else None,
                target_kg=targets[lift],
                weeks_of_data=weeks,
            )
        )
    total = (
        round(sum(l.e1rm_kg for l in lifts), 1) if all(l.e1rm_kg is not None for l in lifts) else None
    )

    sessions = db.scalars(
        select(models.WorkoutSession).where(models.WorkoutSession.athlete_id == athlete_id)
    ).all()
    recent = sum(1 for s in sessions if as_of - timedelta(days=7) < s.session_date <= as_of)

    all_recs = [r for r in athlete_records(db, athlete_id) if r.performed_on <= as_of]
    vol = st.weekly_volume_by_category(all_recs)[-8:]

    bw = db.scalar(
        select(models.DailyMetric)
        .where(
            models.DailyMetric.athlete_id == athlete_id,
            models.DailyMetric.body_weight_kg.is_not(None),
            models.DailyMetric.date <= as_of,
        )
        .order_by(models.DailyMetric.date.desc())
    )

    meet_date = (goal.competition_date if goal and goal.competition_date else None) or athlete.meet_date
    return DashboardOut(
        as_of=as_of,
        meet_name=(goal.competition_name if goal and goal.competition_name else None) or athlete.meet_name,
        meet_date=meet_date,
        days_to_meet=(meet_date - as_of).days if meet_date else None,
        current_window_days=CURRENT_WINDOW_DAYS,
        lifts=lifts,
        estimated_total_kg=total,
        target_total_kg=goal.target_total_kg if goal else None,
        qualification=build_qualification(goal, total),
        forecast=Forecast(
            available=False,
            reason="Meet-day forecasting is the next build phase (Phase 3). "
            "No projection is shown until a validated model exists.",
        ),
        sessions_last_7_days=recent,
        total_sessions=len(sessions),
        weekly_volume=[VolumeWeekOut(**v.__dict__) for v in vol],
        latest_body_weight_kg=bw.body_weight_kg if bw else None,
        latest_body_weight_date=bw.date if bw else None,
    )


@router.get("/exercises", response_model=list[PerformedExercise])
def performed_exercises(athlete_id: int, db: Session = Depends(get_db)):
    """Exercises this athlete has logged, with a quick summary each."""
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    max_reps = get_settings().e1rm_max_reps
    by_ex: dict[int, list[st.SetRecord]] = {}
    for r in athlete_records(db, athlete_id):
        by_ex.setdefault(r.exercise_id, []).append(r)
    comp = {e.id: e.is_competition_lift for e in db.scalars(select(models.Exercise))}
    out = []
    for ex_id, recs in by_ex.items():
        pr = st.personal_records(recs, max_reps)
        out.append(
            PerformedExercise(
                exercise_id=ex_id,
                exercise_name=recs[0].exercise_name,
                category=recs[0].category,
                is_competition_lift=comp.get(ex_id, False),
                set_count=len(recs),
                last_performed=max(r.performed_on for r in recs),
                best_e1rm_kg=pr.best_e1rm.value_kg if pr.best_e1rm else None,
            )
        )
    order = {"squat": 0, "bench": 1, "deadlift": 2, "accessory": 3}
    out.sort(key=lambda e: (not e.is_competition_lift, order[e.category], -e.set_count))
    return out


@router.get("/exercises/{exercise_id}", response_model=ExerciseAnalytics)
def exercise_analytics(athlete_id: int, exercise_id: int, db: Session = Depends(get_db)):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    ex = require_exercise(db, exercise_id)
    max_reps = get_settings().e1rm_max_reps
    recs = athlete_records(db, athlete_id, exercise_id=exercise_id)
    pr = st.personal_records(recs, max_reps)

    def rec(r: st.RecordEntry | None) -> RecordOut | None:
        return RecordOut(**r.__dict__) if r else None

    return ExerciseAnalytics(
        exercise_id=ex.id,
        exercise_name=ex.name,
        category=ex.category,
        total_sets=len(recs),
        weeks=[WeekPointOut(**w.__dict__) for w in st.weekly_progression(recs, max_reps)],
        personal_records=PRsOut(
            best_e1rm=rec(pr.best_e1rm),
            heaviest_single_set=rec(pr.heaviest_single_set),
            rep_maxes={k: rec(v) for k, v in pr.rep_maxes.items()},
        ),
        e1rm_max_reps=max_reps,
    )


@router.get("/volume", response_model=list[VolumeWeekOut])
def weekly_volume(athlete_id: int, db: Session = Depends(get_db)):
    get_or_404(db, models.Athlete, athlete_id, "Athlete")
    return [VolumeWeekOut(**v.__dict__) for v in st.weekly_volume_by_category(athlete_records(db, athlete_id))]
