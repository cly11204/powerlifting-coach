"""SIMULATED demo data generator.

Everything produced here is fake, generated from a fixed random seed. It
exists only so you can explore the charts before you have real history. The
demo athlete is flagged `is_demo=True` and its name says SIMULATED, and the
UI shows a banner whenever it is selected.

Note: the demo goal deliberately leaves the qualifying total EMPTY. The app
never invents a USAPL standard, not even for demo data.
"""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models

DEMO_NAME = "Demo Athlete (SIMULATED DATA)"
WEEKS = 12

# (exercise name, starting top-set weight kg, weekly gain kg, reps, sets)
PLAN = {
    0: [("Competition Squat", 85, 1.25, 4, 4), ("Competition Bench Press", 47.5, 0.5, 5, 4), ("Barbell Row", 40, 0.5, 8, 3)],
    1: [("Competition Deadlift", 105, 1.5, 3, 4), ("Overhead Press", 30, 0.25, 6, 3), ("Hamstring Curl", 25, 0.25, 10, 3)],
    3: [("Pause Squat", 70, 1.0, 3, 3), ("Competition Bench Press", 50, 0.5, 3, 5), ("Lat Pulldown", 40, 0.5, 10, 3)],
    5: [("Competition Squat", 90, 1.25, 2, 3), ("Romanian Deadlift", 75, 1.0, 6, 3), ("Close-Grip Bench Press", 42.5, 0.5, 6, 3)],
}


def _round_plate(kg: float) -> float:
    return round(kg / 2.5) * 2.5


def remove_demo(db: Session) -> int:
    demos = db.scalars(select(models.Athlete).where(models.Athlete.is_demo.is_(True))).all()
    for a in demos:
        db.delete(a)
    db.commit()
    return len(demos)


def create_demo(db: Session, today: date | None = None, seed: int = 7) -> models.Athlete:
    """Replace any existing demo athlete with a freshly simulated one."""
    remove_demo(db)
    rng = random.Random(seed)
    today = today or date.today()
    exercises = {e.name: e for e in db.scalars(select(models.Exercise))}

    athlete = models.Athlete(
        name=DEMO_NAME, sex="F", federation="USAPL", division="Open", equipment="raw",
        weight_class_kg=60, meet_name="Demo Meet (simulated)", meet_date=today + timedelta(days=82),
        preferred_unit="kg", is_demo=True,
    )
    db.add(athlete)
    db.flush()

    db.add(models.CompetitionGoal(
        athlete_id=athlete.id, competition_name="Demo Meet (simulated)",
        competition_date=athlete.meet_date, target_squat_kg=115, target_bench_kg=65,
        target_deadlift_kg=140, target_total_kg=320, qualifying_total_kg=None,
        qualifying_source=None, verification_status="unverified",
        notes="SIMULATED demo goal. Qualifying standard intentionally left blank.",
    ))

    first_monday = today - timedelta(days=today.weekday()) - timedelta(weeks=WEEKS - 1)
    for wk in range(WEEKS):
        deload = wk in (5, 11)  # lighter weeks
        for dow, plan in PLAN.items():
            day = first_monday + timedelta(weeks=wk, days=dow)
            if day > today:
                continue
            start = datetime.combine(day, time(17, 30), tzinfo=timezone.utc)
            sess = models.WorkoutSession(
                athlete_id=athlete.id, title="Simulated session", started_at=start, session_date=day,
                duration_minutes=rng.randint(60, 95), notes="SIMULATED" + (" · deload week" if deload else ""),
            )
            order = 0
            for name, base, gain, reps, n_sets in plan:
                ex = exercises[name]
                top = base + gain * wk + rng.uniform(-1.5, 1.5)
                if deload:
                    top *= 0.85
                # two warm-ups for main lifts
                if ex.category != "accessory":
                    for frac, wr in ((0.5, 5), (0.75, 3)):
                        sess.sets.append(models.ExerciseSet(
                            exercise_id=ex.id, set_order=order, weight_kg=_round_plate(top * frac),
                            reps=wr, set_type="warmup", completed=True))
                        order += 1
                for i in range(n_sets):
                    rpe = min(10.0, round((7 + 0.5 * i + rng.choice([0, 0, 0.5])) * 2) / 2)
                    if deload:
                        rpe = max(5.0, rpe - 1.5)
                    sess.sets.append(models.ExerciseSet(
                        exercise_id=ex.id, set_order=order, weight_kg=_round_plate(top), reps=reps,
                        rpe=rpe if ex.category != "accessory" else None,
                        set_type="top" if i == 0 and ex.category != "accessory" else "working",
                        completed=True, rest_seconds=rng.choice([150, 180, 210, 240]) if i else None))
                    order += 1
            db.add(sess)

    for d in range(WEEKS * 7):
        day = first_monday + timedelta(days=d)
        if day > today:
            break
        if rng.random() < 0.15:  # some days not logged, like real life
            continue
        db.add(models.DailyMetric(
            athlete_id=athlete.id, date=day,
            body_weight_kg=round(60.8 - 0.01 * d + rng.uniform(-0.4, 0.4), 1),
            calories=rng.randint(1900, 2400), protein_g=rng.randint(110, 140),
            carbs_g=rng.randint(200, 290), fat_g=rng.randint(55, 80),
            sleep_hours=round(rng.uniform(6.0, 8.8), 1), fatigue=rng.randint(2, 7),
            soreness=rng.randint(2, 7), stress=rng.randint(2, 6), notes="SIMULATED",
        ))
    db.commit()
    db.refresh(athlete)
    return athlete
