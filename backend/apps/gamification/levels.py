"""XP level curve: a port of libs/shared/src/lib/util/gamification.ts and the
`levelForXp` helper in libs/gamification, so the server and the UI agree at every
threshold. Reaching level N takes `floor(100 * N^1.5)` cumulative XP; level 1 is free.
"""

from dataclasses import dataclass

LEVEL_BASE_XP = 100
LEVEL_EXPONENT = 1.5
MAX_LEVEL = 1000  # safety bound, as in the UI helper


def xp_for_level(level: int) -> int:
    if level < 1:
        raise ValueError(f"level must be a positive integer, got {level}")
    return int(LEVEL_BASE_XP * level**LEVEL_EXPONENT)


def level_from_xp(xp: int) -> int:
    level = 1
    while level < MAX_LEVEL and xp_for_level(level + 1) <= xp:
        level += 1
    return level


@dataclass(frozen=True)
class LevelProgress:
    level: int
    xp_into_level: int
    xp_to_next: int  # XP cost of the whole current level, so into/to_next is a bar fill

    def as_json(self) -> dict:
        return {
            "level": self.level,
            "xpIntoLevel": self.xp_into_level,
            "xpToNext": self.xp_to_next,
        }


def level_progress(xp: int) -> LevelProgress:
    if xp < 0:
        raise ValueError(f"xp must be non-negative, got {xp}")
    level = level_from_xp(xp)
    baseline = 0 if level == 1 else xp_for_level(level)
    return LevelProgress(level, xp - baseline, xp_for_level(level + 1) - baseline)
