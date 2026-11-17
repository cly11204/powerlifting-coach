"""Strength analytics: estimated 1RM, weekly trends, volume and personal records.

Everything here is a pure function over plain `SetRecord`s, with no database
access, so the maths is easy to read and test on its own.

Key ideas
---------
* e1RM (estimated one-rep max) uses the Epley formula:  weight * (1 + reps / 30).
  A single (1 rep) is taken at face value: the e1RM *is* the weight lifted.
* Rep-based formulas get less accurate as reps rise (a 10-rep set says much
  less about your max than a triple), so:
    - 1-5 reps  -> precision "higher"
    - 6-max_reps -> precision "lower"
    - above max_reps (default 10) -> no estimate at all
* Warm-ups, failed / incomplete sets, and zero-weight sets never produce an e1RM.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

Precision = Literal["higher", "lower"]
HIGHER_PRECISION_MAX_REPS = 5
DEFAULT_MAX_REPS = 10


@dataclass(frozen=True)
class SetRecord:
    """A single logged set, flattened for analysis."""

    performed_on: date
    exercise_id: int
    exercise_name: str
    category: str  # squat | bench | deadlift | accessory
    weight_kg: float
    reps: int
    rpe: float | None = None
    set_type: str = "working"
    completed: bool = True
    session_id: int | None = None


# ---------------------------------------------------------------- e1RM
def epley_e1rm(weight_kg: float, reps: int) -> float:
    """Epley estimate. reps == 1 returns the weight itself."""
    if weight_kg < 0:
        raise ValueError("weight must be >= 0")
    if reps < 1:
        raise ValueError("reps must be >= 1")
    if reps == 1:
        return float(weight_kg)
    return weight_kg * (1 + reps / 30)


def e1rm_precision(reps: int, max_reps: int = DEFAULT_MAX_REPS) -> Precision | None:
    if reps < 1 or reps > max_reps:
        return None
    return "higher" if reps <= HIGHER_PRECISION_MAX_REPS else "lower"


def is_e1rm_eligible(rec: SetRecord, max_reps: int = DEFAULT_MAX_REPS) -> bool:
    return (
        rec.completed
        and rec.set_type != "warmup"
        and rec.weight_kg > 0
        and 1 <= rec.reps <= max_reps
    )


def set_e1rm(rec: SetRecord, max_reps: int = DEFAULT_MAX_REPS) -> float | None:
    """e1RM for one set, or None if the set isn't suitable for estimating."""
    if not is_e1rm_eligible(rec, max_reps):
        return None
    return round(epley_e1rm(rec.weight_kg, rec.reps), 1)


def counts_toward_volume(rec: SetRecord) -> bool:
    """Training volume = completed, non-warm-up sets."""
    return rec.completed and rec.set_type != "warmup" and rec.reps > 0


# ---------------------------------------------------------------- weekly trends
def week_start(d: date) -> date:
    """Monday of the ISO week containing d."""
    return d - timedelta(days=d.weekday())


@dataclass
class WeekPoint:
    week_start: date
    best_e1rm_kg: float | None
    best_set_weight_kg: float | None
    best_set_reps: int | None
    best_set_precision: Precision | None
    volume_kg: float  # tonnage: sum(weight * reps)
    working_sets: int
    rolling_avg_e1rm_kg: float | None = None  # mean best e1RM over the trailing window
    change_vs_prev_kg: float | None = None  # vs previous week that had an e1RM
    change_vs_prev_pct: float | None = None


def weekly_progression(
    records: list[SetRecord],
    max_reps: int = DEFAULT_MAX_REPS,
    rolling_weeks: int = 4,
) -> list[WeekPoint]:
    """Group sets by calendar week: best e1RM, volume and trend per week.

    Only weeks with at least one non-warm-up completed set appear. The rolling
    average covers weeks within the trailing `rolling_weeks` calendar weeks
    (gaps are not filled in or invented).
    """
    by_week: dict[date, list[SetRecord]] = defaultdict(list)
    for r in records:
        by_week[week_start(r.performed_on)].append(r)

    points: list[WeekPoint] = []
    for wk in sorted(by_week):
        sets = by_week[wk]
        best: tuple[float, SetRecord] | None = None
        for s in sets:
            e = set_e1rm(s, max_reps)
            if e is not None and (best is None or e > best[0]):
                best = (e, s)
        vol_sets = [s for s in sets if counts_toward_volume(s)]
        if not vol_sets and best is None:
            continue
        points.append(
            WeekPoint(
                week_start=wk,
                best_e1rm_kg=best[0] if best else None,
                best_set_weight_kg=best[1].weight_kg if best else None,
                best_set_reps=best[1].reps if best else None,
                best_set_precision=e1rm_precision(best[1].reps, max_reps) if best else None,
                volume_kg=round(sum(s.weight_kg * s.reps for s in vol_sets), 1),
                working_sets=len(vol_sets),
            )
        )

    prev_e1rm: float | None = None
    for i, p in enumerate(points):
        window_start = p.week_start - timedelta(weeks=rolling_weeks - 1)
        window = [
            q.best_e1rm_kg
            for q in points[: i + 1]
            if q.week_start >= window_start and q.best_e1rm_kg is not None
        ]
        p.rolling_avg_e1rm_kg = round(sum(window) / len(window), 1) if window else None
        if p.best_e1rm_kg is not None:
            if prev_e1rm is not None:
                p.change_vs_prev_kg = round(p.best_e1rm_kg - prev_e1rm, 1)
                p.change_vs_prev_pct = round(100 * (p.best_e1rm_kg - prev_e1rm) / prev_e1rm, 1)
            prev_e1rm = p.best_e1rm_kg
    return points


# ---------------------------------------------------------------- personal records
@dataclass
class RecordEntry:
    value_kg: float
    weight_kg: float
    reps: int
    performed_on: date


@dataclass
class PersonalRecords:
    best_e1rm: RecordEntry | None = None
    heaviest_single_set: RecordEntry | None = None  # heaviest weight moved for >= 1 rep
    # Heaviest weight lifted for exactly N reps, N = 1..max_reps.
    rep_maxes: dict[int, RecordEntry] = field(default_factory=dict)


def personal_records(records: list[SetRecord], max_reps: int = DEFAULT_MAX_REPS) -> PersonalRecords:
    """PRs for one exercise. Ties go to the earliest date (first time achieved)."""
    pr = PersonalRecords()
    for r in sorted(records, key=lambda x: x.performed_on):
        if not r.completed or r.set_type == "warmup" or r.reps < 1 or r.weight_kg <= 0:
            continue
        e = set_e1rm(r, max_reps)
        if e is not None and (pr.best_e1rm is None or e > pr.best_e1rm.value_kg):
            pr.best_e1rm = RecordEntry(e, r.weight_kg, r.reps, r.performed_on)
        if pr.heaviest_single_set is None or r.weight_kg > pr.heaviest_single_set.weight_kg:
            pr.heaviest_single_set = RecordEntry(r.weight_kg, r.weight_kg, r.reps, r.performed_on)
        if r.reps <= max_reps:
            cur = pr.rep_maxes.get(r.reps)
            if cur is None or r.weight_kg > cur.weight_kg:
                pr.rep_maxes[r.reps] = RecordEntry(r.weight_kg, r.weight_kg, r.reps, r.performed_on)
    pr.rep_maxes = dict(sorted(pr.rep_maxes.items()))
    return pr


# ---------------------------------------------------------------- current estimate
@dataclass
class CurrentEstimate:
    e1rm_kg: float
    weight_kg: float
    reps: int
    precision: Precision
    performed_on: date
    exercise_name: str


def current_estimate(
    records: list[SetRecord],
    as_of: date,
    window_days: int = 42,
    max_reps: int = DEFAULT_MAX_REPS,
) -> CurrentEstimate | None:
    """Best e1RM from sets in the last `window_days` days (default 6 weeks).

    This is a *recent best*, not a forecast. Older sets are ignored so that a
    PR from months ago doesn't masquerade as current strength.
    """
    start = as_of - timedelta(days=window_days)
    best: CurrentEstimate | None = None
    for r in records:
        if not (start < r.performed_on <= as_of):
            continue
        e = set_e1rm(r, max_reps)
        if e is None:
            continue
        if best is None or e > best.e1rm_kg:
            best = CurrentEstimate(
                e, r.weight_kg, r.reps, e1rm_precision(r.reps, max_reps), r.performed_on, r.exercise_name
            )
    return best


# ---------------------------------------------------------------- volume by lift
@dataclass
class VolumeWeek:
    week_start: date
    squat_kg: float = 0.0
    bench_kg: float = 0.0
    deadlift_kg: float = 0.0
    accessory_kg: float = 0.0
    total_sets: int = 0


def weekly_volume_by_category(records: list[SetRecord]) -> list[VolumeWeek]:
    weeks: dict[date, VolumeWeek] = {}
    for r in records:
        if not counts_toward_volume(r):
            continue
        wk = week_start(r.performed_on)
        vw = weeks.setdefault(wk, VolumeWeek(week_start=wk))
        attr = f"{r.category}_kg"
        setattr(vw, attr, round(getattr(vw, attr) + r.weight_kg * r.reps, 1))
        vw.total_sets += 1
    return [weeks[k] for k in sorted(weeks)]
