"""Pure gamification math, pinned to the TypeScript originals it replaces
(libs/shared/src/lib/util/gamification.ts, libs/gamification leveling + streaks)."""

from datetime import date, timedelta

import pytest

from apps.gamification.levels import level_from_xp, level_progress, xp_for_level
from apps.gamification.streaks import current_streak, strip

TODAY = date(2026, 10, 28)


def days_ago(*offsets):
    return [TODAY - timedelta(days=n) for n in offsets]


# --- levels (thresholds from libs/gamification/src/lib/leveling.ts) ---------


@pytest.mark.parametrize(
    "level,xp", [(1, 100), (2, 282), (3, 519), (4, 800), (5, 1118), (10, 3162), (20, 8944)]
)
def test_level_thresholds_match_the_shared_curve(level, xp):
    assert xp_for_level(level) == xp


@pytest.mark.parametrize(
    "xp,level",
    [(0, 1), (100, 1), (281, 1), (282, 2), (518, 2), (519, 3), (799, 3), (800, 4), (10_000, 21)],
)
def test_level_from_xp_changes_exactly_at_the_threshold(xp, level):
    assert level_from_xp(xp) == level


def test_level_progress_reports_position_inside_the_level():
    assert level_progress(0).as_json() == {"level": 1, "xpIntoLevel": 0, "xpToNext": 282}
    assert level_progress(100).as_json() == {"level": 1, "xpIntoLevel": 100, "xpToNext": 282}
    assert level_progress(282).as_json() == {"level": 2, "xpIntoLevel": 0, "xpToNext": 237}
    assert level_progress(400).as_json() == {"level": 2, "xpIntoLevel": 118, "xpToNext": 237}


def test_level_progress_rejects_negative_xp():
    with pytest.raises(ValueError):
        level_progress(-1)


def test_levels_never_go_down_as_xp_grows():
    levels = [level_from_xp(xp) for xp in range(0, 5000, 7)]
    assert levels == sorted(levels)


# --- streaks -----------------------------------------------------------------


def test_no_activity_is_no_streak():
    assert current_streak([], TODAY) == 0


def test_consecutive_days_ending_today():
    assert current_streak(days_ago(0, 1, 2), TODAY) == 3


def test_today_is_still_open_so_a_run_ending_yesterday_counts():
    assert current_streak(days_ago(1, 2, 3, 4), TODAY) == 4


def test_a_missed_day_breaks_the_streak():
    assert current_streak(days_ago(2, 3, 4), TODAY) == 0


def test_a_gap_ends_the_run():
    assert current_streak(days_ago(0, 1, 3, 4, 5), TODAY) == 2


def test_duplicate_days_do_not_double_count():
    assert current_streak(days_ago(0, 0, 1, 1), TODAY) == 2


def test_future_days_are_ignored():
    assert current_streak([TODAY + timedelta(days=1)], TODAY) == 0


def test_strip_is_oldest_first_and_ends_today():
    result = strip(days_ago(0, 1, 4), TODAY, length=7)
    assert result == [False, False, True, False, False, True, True]


def test_strip_default_is_fourteen_days_and_marks_real_activity_not_a_run():
    result = strip(days_ago(0, 5, 13), TODAY)
    assert len(result) == 14
    assert result[-1] and result[-6] and result[0]  # separate days, not one run
    assert sum(result) == 3
