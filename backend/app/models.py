"""SQLAlchemy ORM models (the database tables).

Every weight column is in kilograms; every timestamp is UTC.
Enumerated values are stored as short strings guarded by CHECK constraints,
which migrate cleanly to PostgreSQL / Supabase later.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---- Allowed values (shared with schemas.py) ----
SEXES = ("F", "M", "Mx")
EQUIPMENT = ("raw", "wraps", "single_ply", "multi_ply")
UNITS = ("kg", "lb")
LIFT_CATEGORIES = ("squat", "bench", "deadlift", "accessory")
SET_TYPES = ("warmup", "working", "top", "backoff", "amrap")
VERIFICATION_STATUSES = ("unverified", "verified")
DATA_SUFFICIENCY = ("insufficient", "limited", "adequate")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class UTCDateTime(TypeDecorator):
    """Stores datetimes as naive UTC; always returns timezone-aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetimes are not allowed; attach a timezone.")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


class Athlete(TimestampMixin, Base):
    __tablename__ = "athletes"
    __table_args__ = (
        CheckConstraint(_in("sex", SEXES), name="ck_athlete_sex"),
        CheckConstraint(_in("equipment", EQUIPMENT), name="ck_athlete_equipment"),
        CheckConstraint(_in("preferred_unit", UNITS), name="ck_athlete_unit"),
        CheckConstraint("weight_class_kg > 0", name="ck_athlete_weight_class"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sex: Mapped[str] = mapped_column(String(2), nullable=False)
    federation: Mapped[str] = mapped_column(String(50), nullable=False)
    division: Mapped[str] = mapped_column(String(50), nullable=False)
    equipment: Mapped[str] = mapped_column(String(20), nullable=False)
    weight_class_kg: Mapped[float] = mapped_column(Float, nullable=False)
    meet_name: Mapped[str | None] = mapped_column(String(150))
    meet_date: Mapped[date | None] = mapped_column(Date)
    preferred_unit: Mapped[str] = mapped_column(String(2), default="kg", nullable=False)
    # True only for the simulated demo athlete. All of that athlete's data is simulated.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    sessions: Mapped[list[WorkoutSession]] = relationship(
        back_populates="athlete", cascade="all, delete-orphan"
    )
    daily_metrics: Mapped[list[DailyMetric]] = relationship(
        back_populates="athlete", cascade="all, delete-orphan"
    )
    goals: Mapped[list[CompetitionGoal]] = relationship(
        back_populates="athlete", cascade="all, delete-orphan"
    )
    predictions: Mapped[list[StrengthPrediction]] = relationship(
        back_populates="athlete", cascade="all, delete-orphan"
    )


class Exercise(TimestampMixin, Base):
    """Exercise catalogue. `category` ties variations back to a competition lift."""

    __tablename__ = "exercises"
    __table_args__ = (CheckConstraint(_in("category", LIFT_CATEGORIES), name="ck_exercise_category"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    # True for the exact competition movement (e.g. "Competition Squat").
    is_competition_lift: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class WorkoutSession(TimestampMixin, Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        CheckConstraint(
            "duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 600)",
            name="ck_session_duration",
        ),
        Index("ix_sessions_athlete_started", "athlete_id", "started_at"),
        Index("ix_sessions_athlete_date", "athlete_id", "session_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    # The athlete's *local* calendar day for the session, taken from the offset the
    # client sent with started_at. Used for weekly grouping so an 8 pm workout
    # doesn't land on "tomorrow" in UTC.
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    athlete: Mapped[Athlete] = relationship(back_populates="sessions")
    sets: Mapped[list[ExerciseSet]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ExerciseSet.set_order",
    )


class ExerciseSet(TimestampMixin, Base):
    __tablename__ = "exercise_sets"
    __table_args__ = (
        CheckConstraint("weight_kg >= 0 AND weight_kg <= 600", name="ck_set_weight"),
        CheckConstraint("reps >= 0 AND reps <= 100", name="ck_set_reps"),
        CheckConstraint("rpe IS NULL OR (rpe >= 5 AND rpe <= 10)", name="ck_set_rpe"),
        CheckConstraint(
            "rest_seconds IS NULL OR (rest_seconds >= 0 AND rest_seconds <= 3600)",
            name="ck_set_rest",
        ),
        CheckConstraint(_in("set_type", SET_TYPES), name="ck_set_type"),
        Index("ix_sets_session_order", "session_id", "set_order"),
        Index("ix_sets_exercise", "exercise_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False
    )
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), nullable=False
    )
    set_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    rpe: Mapped[float | None] = mapped_column(Float)
    set_type: Mapped[str] = mapped_column(String(10), default="working", nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rest_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
    exercise: Mapped[Exercise] = relationship()


class DailyMetric(TimestampMixin, Base):
    """One row per athlete per calendar day: nutrition, body weight, recovery."""

    __tablename__ = "daily_metrics"
    __table_args__ = (
        UniqueConstraint("athlete_id", "date", name="uq_metric_athlete_date"),
        CheckConstraint("body_weight_kg IS NULL OR (body_weight_kg > 20 AND body_weight_kg < 300)", name="ck_metric_bw"),
        CheckConstraint("calories IS NULL OR (calories >= 0 AND calories <= 15000)", name="ck_metric_kcal"),
        CheckConstraint("protein_g IS NULL OR protein_g >= 0", name="ck_metric_protein"),
        CheckConstraint("carbs_g IS NULL OR carbs_g >= 0", name="ck_metric_carbs"),
        CheckConstraint("fat_g IS NULL OR fat_g >= 0", name="ck_metric_fat"),
        CheckConstraint("sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)", name="ck_metric_sleep"),
        CheckConstraint("fatigue IS NULL OR (fatigue BETWEEN 1 AND 10)", name="ck_metric_fatigue"),
        CheckConstraint("soreness IS NULL OR (soreness BETWEEN 1 AND 10)", name="ck_metric_soreness"),
        CheckConstraint("stress IS NULL OR (stress BETWEEN 1 AND 10)", name="ck_metric_stress"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    body_weight_kg: Mapped[float | None] = mapped_column(Float)
    calories: Mapped[int | None] = mapped_column(Integer)
    protein_g: Mapped[float | None] = mapped_column(Float)
    carbs_g: Mapped[float | None] = mapped_column(Float)
    fat_g: Mapped[float | None] = mapped_column(Float)
    sleep_hours: Mapped[float | None] = mapped_column(Float)
    fatigue: Mapped[int | None] = mapped_column(Integer)
    soreness: Mapped[int | None] = mapped_column(Integer)
    stress: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    athlete: Mapped[Athlete] = relationship(back_populates="daily_metrics")


class CompetitionGoal(TimestampMixin, Base):
    """Targets for a competition plus the (user-verified) qualifying standard.

    The qualifying total is never assumed by the app. It must be entered by the
    athlete together with its source, and stays 'unverified' until they confirm it.
    """

    __tablename__ = "competition_goals"
    __table_args__ = (
        CheckConstraint(_in("verification_status", VERIFICATION_STATUSES), name="ck_goal_verification"),
        CheckConstraint(
            "verification_status = 'unverified' OR "
            "(qualifying_total_kg IS NOT NULL AND qualifying_source IS NOT NULL)",
            name="ck_goal_verified_needs_source",
        ),
        CheckConstraint("qualifying_total_kg IS NULL OR qualifying_total_kg > 0", name="ck_goal_qt"),
        Index("ix_goals_athlete", "athlete_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    competition_name: Mapped[str | None] = mapped_column(String(150))
    competition_date: Mapped[date | None] = mapped_column(Date)
    target_squat_kg: Mapped[float | None] = mapped_column(Float)
    target_bench_kg: Mapped[float | None] = mapped_column(Float)
    target_deadlift_kg: Mapped[float | None] = mapped_column(Float)
    target_total_kg: Mapped[float | None] = mapped_column(Float)
    qualifying_total_kg: Mapped[float | None] = mapped_column(Float)
    qualifying_source: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(12), default="unverified", nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    notes: Mapped[str | None] = mapped_column(Text)

    athlete: Mapped[Athlete] = relationship(back_populates="goals")


class StrengthPrediction(TimestampMixin, Base):
    """Stored forecasts (populated by the Phase 3 prediction engine)."""

    __tablename__ = "strength_predictions"
    __table_args__ = (
        CheckConstraint(_in("lift", ("squat", "bench", "deadlift")), name="ck_pred_lift"),
        CheckConstraint(_in("data_sufficiency", DATA_SUFFICIENCY), name="ck_pred_sufficiency"),
        CheckConstraint(
            "lower_kg IS NULL OR upper_kg IS NULL OR lower_kg <= upper_kg", name="ck_pred_bounds"
        ),
        Index("ix_pred_athlete_lift_date", "athlete_id", "lift", "prediction_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(
        ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    prediction_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    lift: Mapped[str] = mapped_column(String(10), nullable=False)
    predicted_1rm_kg: Mapped[float | None] = mapped_column(Float)
    lower_kg: Mapped[float | None] = mapped_column(Float)
    upper_kg: Mapped[float | None] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    data_sufficiency: Mapped[str] = mapped_column(String(12), nullable=False)

    athlete: Mapped[Athlete] = relationship(back_populates="predictions")
