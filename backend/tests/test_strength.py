"""Unit tests for the pure strength-analytics functions."""
from datetime import date

import pytest

from app.services.strength import (
    SetRecord,
    current_estimate,
    e1rm_precision,
    epley_e1rm,
    personal_records,
    set_e1rm,
    week_start,
    weekly_progression,
    weekly_volume_by_category,
)


def rec(day, weight, reps, set_type="working", completed=True, category="squat", ex_id=1):
    return SetRecord(
        performed_on=day, exercise_id=ex_id, exercise_name="Competition Squat", category=category,
        weight_kg=weight, reps=reps, set_type=set_type, completed=completed,
    )


class TestEpley:
    def test_single_is_the_weight_itself(self):
        assert epley_e1rm(100, 1) == 100

    def test_known_value(self):
        # 100 kg x 5 -> 100 * (1 + 5/30) = 116.67
        assert epley_e1rm(100, 5) == pytest.approx(116.6667, rel=1e-4)

    def test_rejects_bad_input(self):
        with pytest.raises(ValueError):
            epley_e1rm(100, 0)
        with pytest.raises(ValueError):
            epley_e1rm(-5, 3)

    def test_precision_bands(self):
        assert e1rm_precision(3) == "higher"
        assert e1rm_precision(5) == "higher"
        assert e1rm_precision(8) == "lower"
        assert e1rm_precision(11) is None
        assert e1rm_precision(0) is None


class TestSetEligibility:
    d = date(2026, 11, 2)

    def test_warmups_excluded(self):
        assert set_e1rm(rec(self.d, 60, 5, set_type="warmup")) is None

    def test_incomplete_excluded(self):
        assert set_e1rm(rec(self.d, 100, 3, completed=False)) is None

    def test_high_reps_excluded(self):
        assert set_e1rm(rec(self.d, 50, 15)) is None
        assert set_e1rm(rec(self.d, 50, 15), max_reps=20) is not None

    def test_zero_weight_excluded(self):
        assert set_e1rm(rec(self.d, 0, 5)) is None

    def test_rounded_to_one_decimal(self):
        assert set_e1rm(rec(self.d, 100, 5)) == 116.7


class TestWeekly:
    def test_week_start_is_monday(self):
        assert week_start(date(2026, 11, 19)) == date(2026, 11, 16)  # Thu -> Mon
        assert week_start(date(2026, 11, 16)) == date(2026, 11, 16)

    def test_best_per_week_volume_and_change(self):
        records = [
            rec(date(2026, 11, 2), 60, 5, set_type="warmup"),  # ignored everywhere
            rec(date(2026, 11, 2), 100, 5),  # 116.7
            rec(date(2026, 11, 4), 105, 3),  # 115.5
            rec(date(2026, 11, 10), 110, 3),  # 121.0
        ]
        weeks = weekly_progression(records)
        assert [w.week_start for w in weeks] == [date(2026, 11, 2), date(2026, 11, 9)]
        assert weeks[0].best_e1rm_kg == 116.7
        assert weeks[0].best_set_weight_kg == 100
        assert weeks[0].volume_kg == 100 * 5 + 105 * 3
        assert weeks[0].working_sets == 2
        assert weeks[0].change_vs_prev_kg is None
        assert weeks[1].best_e1rm_kg == 121.0
        assert weeks[1].change_vs_prev_kg == 4.3
        assert weeks[1].rolling_avg_e1rm_kg == round((116.7 + 121.0) / 2, 1)

    def test_rolling_window_ignores_old_weeks(self):
        records = [rec(date(2026, 9, 7), 200, 1), rec(date(2026, 11, 9), 100, 1)]
        weeks = weekly_progression(records, rolling_weeks=4)
        assert weeks[-1].rolling_avg_e1rm_kg == 100  # September is outside the 4-week window

    def test_high_rep_only_week_has_volume_but_no_e1rm(self):
        weeks = weekly_progression([rec(date(2026, 11, 2), 50, 15)])
        assert weeks[0].best_e1rm_kg is None
        assert weeks[0].volume_kg == 750

    def test_empty(self):
        assert weekly_progression([]) == []


class TestPRs:
    def test_records(self):
        records = [
            rec(date(2026, 10, 1), 100, 5),
            rec(date(2026, 10, 8), 110, 1),
            rec(date(2026, 10, 15), 100, 5),  # tie -> keeps earlier date
            rec(date(2026, 10, 20), 120, 1, completed=False),  # failed -> ignored
        ]
        pr = personal_records(records)
        assert pr.best_e1rm.value_kg == 116.7
        assert pr.best_e1rm.performed_on == date(2026, 10, 1)
        assert pr.heaviest_single_set.weight_kg == 110
        assert set(pr.rep_maxes) == {1, 5}
        assert pr.rep_maxes[5].performed_on == date(2026, 10, 1)

    def test_empty(self):
        pr = personal_records([])
        assert pr.best_e1rm is None and pr.rep_maxes == {}


class TestCurrentEstimate:
    def test_uses_only_recent_window(self):
        today = date(2026, 11, 17)
        records = [rec(date(2026, 8, 1), 150, 1), rec(date(2026, 11, 10), 100, 3)]
        cur = current_estimate(records, today, window_days=42)
        assert cur.e1rm_kg == 110.0
        assert cur.precision == "higher"

    def test_ignores_future_sets(self):
        assert current_estimate([rec(date(2026, 12, 1), 100, 1)], date(2026, 11, 17)) is None


def test_volume_by_category():
    d = date(2026, 11, 2)
    vol = weekly_volume_by_category([
        rec(d, 100, 5), rec(d, 50, 5, category="bench"), rec(d, 40, 5, set_type="warmup"),
    ])
    assert len(vol) == 1
    assert vol[0].squat_kg == 500 and vol[0].bench_kg == 250 and vol[0].total_sets == 2
