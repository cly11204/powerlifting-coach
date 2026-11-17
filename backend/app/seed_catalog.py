"""Default exercise catalogue (reference data, not athlete data)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise

DEFAULT_EXERCISES: list[tuple[str, str, bool]] = [
    ("Competition Squat", "squat", True),
    ("Pause Squat", "squat", False),
    ("Tempo Squat", "squat", False),
    ("Front Squat", "squat", False),
    ("Competition Bench Press", "bench", True),
    ("Close-Grip Bench Press", "bench", False),
    ("Larsen Press", "bench", False),
    ("Spoto Press", "bench", False),
    ("Touch-and-Go Bench Press", "bench", False),
    ("Competition Deadlift", "deadlift", True),
    ("Paused Deadlift", "deadlift", False),
    ("Deficit Deadlift", "deadlift", False),
    ("Romanian Deadlift", "deadlift", False),
    ("Block Pull", "deadlift", False),
    ("Barbell Row", "accessory", False),
    ("Pull-Up", "accessory", False),
    ("Lat Pulldown", "accessory", False),
    ("Overhead Press", "accessory", False),
    ("Dumbbell Bench Press", "accessory", False),
    ("Leg Press", "accessory", False),
    ("Bulgarian Split Squat", "accessory", False),
    ("Hip Thrust", "accessory", False),
    ("Hamstring Curl", "accessory", False),
    ("Triceps Pushdown", "accessory", False),
    ("Plank", "accessory", False),
]


def ensure_default_exercises(db: Session) -> None:
    existing = set(db.scalars(select(Exercise.name)))
    for name, cat, comp in DEFAULT_EXERCISES:
        if name not in existing:
            db.add(Exercise(name=name, category=cat, is_competition_lift=comp))
    db.commit()
