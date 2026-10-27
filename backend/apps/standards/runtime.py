import hashlib
import json
import math
from decimal import Decimal

from rest_framework.exceptions import ValidationError


def runtime_hash(cmi: dict) -> str:
    return hashlib.sha256(json.dumps(cmi, sort_keys=True, allow_nan=False).encode()).hexdigest()


def outcome(cmi: dict, version: str) -> tuple[bool, int | None]:
    try:
        root = cmi["cmi"]
        if not isinstance(root, dict):
            raise ValueError()
        if version == "1.2":
            core = root.get("core", {})
            status = core.get("lesson_status", "not attempted")
            if status not in {
                "passed",
                "completed",
                "failed",
                "incomplete",
                "browsed",
                "not attempted",
            }:
                raise ValueError()
            completed = status in {"completed", "passed"}
            scores = core.get("score", {})
            raw = scores.get("raw", "")
            score = None
            if raw != "":
                low, high = float(scores.get("min") or 0), float(scores.get("max") or 100)
                raw = float(raw)
                if not all(math.isfinite(n) for n in [low, high, raw]) or high <= low:
                    raise ValueError()
                if not low <= raw <= high:
                    raise ValueError()
                score = int(Decimal(str((raw - low) * 100 / (high - low))).quantize(Decimal("1")))
        else:
            status = root.get("completion_status", "unknown")
            success = root.get("success_status", "unknown")
            if status not in {"completed", "incomplete", "not attempted", "unknown"}:
                raise ValueError()
            if success not in {"passed", "failed", "unknown"}:
                raise ValueError()
            completed = status == "completed"
            scaled = root.get("score", {}).get("scaled", "")
            score = None
            if scaled != "":
                value = float(scaled)
                if not math.isfinite(value) or not -1 <= value <= 1:
                    raise ValueError()
                # Learning model stores a nonnegative percentage; preserve original scaled CMI.
                score = max(0, round(value * 100))
        return completed, score
    except (KeyError, AttributeError, TypeError, ValueError, OverflowError) as error:
        raise ValidationError("Invalid SCORM status or score data.") from error
