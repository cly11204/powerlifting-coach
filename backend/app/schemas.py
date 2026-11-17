"""Pydantic schemas: what the API accepts and returns.

Weights are always kilograms on the wire. The frontend converts for display.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Sex = Literal["F", "M", "Mx"]
Equipment = Literal["raw", "wraps", "single_ply", "multi_ply"]
Unit = Literal["kg", "lb"]
LiftCategory = Literal["squat", "bench", "deadlift", "accessory"]
SetType = Literal["warmup", "working", "top", "backoff", "amrap"]
Verification = Literal["unverified", "verified"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _require_tz(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is None:
        raise ValueError("datetime must include a timezone offset (e.g. 2026-11-17T18:00:00Z)")
    return v


def _check_rpe(v: float | None) -> float | None:
    if v is not None and (v * 2) != int(v * 2):
        raise ValueError("RPE must be in 0.5 steps (e.g. 7, 7.5, 8)")
    return v


# ---------------- Athlete ----------------
class AthleteBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sex: Sex
    federation: str = Field(min_length=1, max_length=50)
    division: str = Field(min_length=1, max_length=50)
    equipment: Equipment
    weight_class_kg: float = Field(gt=0, le=200)
    meet_name: str | None = Field(default=None, max_length=150)
    meet_date: date | None = None
    preferred_unit: Unit = "kg"


class AthleteCreate(AthleteBase):
    pass


class AthleteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sex: Sex | None = None
    federation: str | None = Field(default=None, min_length=1, max_length=50)
    division: str | None = Field(default=None, min_length=1, max_length=50)
    equipment: Equipment | None = None
    weight_class_kg: float | None = Field(default=None, gt=0, le=200)
    meet_name: str | None = Field(default=None, max_length=150)
    meet_date: date | None = None
    preferred_unit: Unit | None = None


class AthleteOut(AthleteBase, ORM):
    id: int
    is_demo: bool
    created_at: datetime
    updated_at: datetime


# ---------------- Competition goal ----------------
class GoalUpsert(BaseModel):
    competition_name: str | None = Field(default=None, max_length=150)
    competition_date: date | None = None
    target_squat_kg: float | None = Field(default=None, gt=0, le=600)
    target_bench_kg: float | None = Field(default=None, gt=0, le=600)
    target_deadlift_kg: float | None = Field(default=None, gt=0, le=600)
    target_total_kg: float | None = Field(default=None, gt=0, le=1500)
    qualifying_total_kg: float | None = Field(default=None, gt=0, le=1500)
    qualifying_source: str | None = Field(default=None, max_length=2000)
    verification_status: Verification = "unverified"
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _verified_needs_evidence(self):
        if self.verification_status == "verified":
            if self.qualifying_total_kg is None:
                raise ValueError("A verified standard needs a qualifying total.")
            if not (self.qualifying_source and self.qualifying_source.strip()):
                raise ValueError("A verified standard needs a source (e.g. the official USAPL page or document).")
        return self


class GoalOut(GoalUpsert, ORM):
    id: int
    athlete_id: int
    verified_at: datetime | None
    updated_at: datetime


# ---------------- Exercises ----------------
class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: LiftCategory
    is_competition_lift: bool = False


class ExerciseOut(ExerciseCreate, ORM):
    id: int


# ---------------- Sets ----------------
class SetBase(BaseModel):
    exercise_id: int
    weight_kg: float = Field(ge=0, le=600)
    reps: int = Field(ge=0, le=100)
    rpe: float | None = Field(default=None, ge=5, le=10)
    set_type: SetType = "working"
    completed: bool = True
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)
    notes: str | None = Field(default=None, max_length=1000)
    set_order: int | None = Field(default=None, ge=0)

    @field_validator("rpe")
    @classmethod
    def _rpe_steps(cls, v):
        return _check_rpe(v)


class SetCreate(SetBase):
    pass


class SetUpdate(BaseModel):
    exercise_id: int | None = None
    weight_kg: float | None = Field(default=None, ge=0, le=600)
    reps: int | None = Field(default=None, ge=0, le=100)
    rpe: float | None = Field(default=None, ge=5, le=10)
    set_type: SetType | None = None
    completed: bool | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)
    notes: str | None = Field(default=None, max_length=1000)
    set_order: int | None = Field(default=None, ge=0)

    @field_validator("rpe")
    @classmethod
    def _rpe_steps(cls, v):
        return _check_rpe(v)


class SetOut(ORM):
    id: int
    session_id: int
    exercise_id: int
    exercise_name: str
    set_order: int
    weight_kg: float
    reps: int
    rpe: float | None
    set_type: SetType
    completed: bool
    rest_seconds: int | None
    notes: str | None
    # Estimated 1RM for this set, or null if the set isn't suitable (warm-up, too many reps...).
    e1rm_kg: float | None = None


# ---------------- Sessions ----------------
class SessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    started_at: datetime
    duration_minutes: int | None = Field(default=None, ge=0, le=600)
    notes: str | None = Field(default=None, max_length=5000)
    sets: list[SetCreate] = Field(default_factory=list, max_length=200)

    @field_validator("started_at")
    @classmethod
    def _tz_aware(cls, v):
        return _require_tz(v)


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    started_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=600)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("started_at")
    @classmethod
    def _tz_aware(cls, v):
        return _require_tz(v)


class SessionSummary(ORM):
    id: int
    athlete_id: int
    title: str | None
    started_at: datetime
    duration_minutes: int | None
    notes: str | None
    set_count: int
    exercise_names: list[str]
    volume_kg: float


class SessionOut(SessionSummary):
    sets: list[SetOut]


class PreviousPerformance(BaseModel):
    exercise_id: int
    session_id: int | None
    started_at: datetime | None
    sets: list[SetOut]


# ---------------- Daily metrics ----------------
class MetricBase(BaseModel):
    body_weight_kg: float | None = Field(default=None, gt=20, lt=300)
    calories: int | None = Field(default=None, ge=0, le=15000)
    protein_g: float | None = Field(default=None, ge=0, le=1000)
    carbs_g: float | None = Field(default=None, ge=0, le=2000)
    fat_g: float | None = Field(default=None, ge=0, le=1000)
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    fatigue: int | None = Field(default=None, ge=1, le=10)
    soreness: int | None = Field(default=None, ge=1, le=10)
    stress: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=2000)


class MetricUpsert(MetricBase):
    pass


class MetricOut(MetricBase, ORM):
    id: int
    athlete_id: int
    date: date
