"""Pulse streak from real activity days (UTC calendar dates, so timezone skew
between a learner's device and the server cannot inflate a streak).

A streak is the run of consecutive active days ending today, or ending yesterday
(today is still open). Anything older is broken and reads as 0.
"""

from collections.abc import Iterable
from datetime import date, timedelta

STRIP_DAYS = 14


def current_streak(days: Iterable[date], today: date) -> int:
    active = set(days)
    cursor = today if today in active else today - timedelta(days=1)
    streak = 0
    while cursor in active:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def strip(days: Iterable[date], today: date, length: int = STRIP_DAYS) -> list[bool]:
    """Activity for the last `length` days, oldest first; the last entry is today."""
    active = set(days)
    return [today - timedelta(days=offset) in active for offset in range(length - 1, -1, -1)]
