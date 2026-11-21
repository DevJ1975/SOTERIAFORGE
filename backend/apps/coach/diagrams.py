"""Diagram specs: what the model may propose, and the checked form the client draws.

The model fills one flat shape (`MODEL_SCHEMA`) whatever the diagram type, because a
single shape is far more reliable under constrained generation than a union. `build`
turns it into the typed spec of the API, or None: a diagram is an optional extra, so a
malformed one is dropped and the written answer still stands. The text alternative is
written here from the checked data, never by the model.
"""

LABEL = 60
DETAIL = 140
TYPES = ["linear_flow", "before_after", "comparison", "two_by_two"]

_text = {"type": "string", "maxLength": DETAIL}
_axis = {
    "type": "object",
    "properties": {"label": _text, "low": _text, "high": _text},
    "required": ["label", "low", "high"],
    "additionalProperties": False,
}
MODEL_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["none", *TYPES]},
        "title": _text,
        "groups": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "label": _text,
                    "points": {"type": "array", "maxItems": 4, "items": _text},
                },
                "required": ["label", "points"],
                "additionalProperties": False,
            },
        },
        "xAxis": _axis,
        "yAxis": _axis,
    },
    "required": ["type", "title", "groups"],
    "additionalProperties": False,
}

PROMPT = (
    "Add a diagram only when the sources describe a sequence, a change, a comparison or "
    "two crossed factors; otherwise set diagram.type to none. "
    "linear_flow: 2-6 groups, each one step in order (label, optional one-point detail). "
    "A label names the thing itself in a few words, never a number such as Step 1. "
    "before_after: exactly 2 groups, before then after. "
    "comparison: 2-3 groups, one per thing compared. "
    "two_by_two: exactly 4 groups in the order top-left, top-right, bottom-left, "
    "bottom-right, plus xAxis and yAxis with their low and high ends. "
    "Diagram text must come from the sources and stay short. "
)


def _clean(value, limit: int) -> str:
    return " ".join(value.split())[:limit].strip() if isinstance(value, str) else ""


def _groups(raw) -> list[dict]:
    groups = []
    for group in raw if isinstance(raw, list) else []:
        if not isinstance(group, dict):
            return []
        label = _clean(group.get("label"), LABEL)
        points = group.get("points")
        points = [_clean(p, DETAIL) for p in points] if isinstance(points, list) else []
        if not label:
            return []
        groups.append({"label": label, "points": [p for p in points if p][:4]})
    return groups


def _axis_of(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    axis = {key: _clean(raw.get(key), LABEL) for key in ("label", "low", "high")}
    return axis if all(axis.values()) else None


def build(raw) -> dict | None:
    """The checked diagram for a model proposal, or None when there is nothing usable."""
    if not isinstance(raw, dict) or raw.get("type") not in TYPES:
        return None
    kind = raw["type"]
    title = _clean(raw.get("title"), LABEL)
    groups = _groups(raw.get("groups"))
    if not title or not groups:
        return None

    if kind == "linear_flow":
        if not 2 <= len(groups) <= 6:
            return None
        steps = [
            {"label": g["label"], **({"detail": g["points"][0]} if g["points"] else {})}
            for g in groups
        ]
        spec: dict = {"type": kind, "title": title, "steps": steps}
        said = "; then ".join(
            s["label"] + (f" ({s['detail']})" if "detail" in s else "") for s in steps
        )
        spec["alt"] = f"{title}. A flow of {len(steps)} steps: {said}."
        return spec

    if kind in ("before_after", "comparison"):
        wanted = (2, 2) if kind == "before_after" else (2, 3)
        if not wanted[0] <= len(groups) <= wanted[1] or not all(g["points"] for g in groups):
            return None
        said = " ".join(f"{g['label']}: {'; '.join(g['points'])}." for g in groups)
        if kind == "before_after":
            return {
                "type": kind,
                "title": title,
                "before": groups[0],
                "after": groups[1],
                "alt": f"{title}. Before and after. {said}",
            }
        return {
            "type": kind,
            "title": title,
            "columns": groups,
            "alt": f"{title}. A comparison of {len(groups)}. {said}",
        }

    x_axis, y_axis = _axis_of(raw.get("xAxis")), _axis_of(raw.get("yAxis"))
    if len(groups) != 4 or not x_axis or not y_axis:
        return None
    quadrants = [
        {"label": g["label"], **({"detail": g["points"][0]} if g["points"] else {})} for g in groups
    ]
    where = [
        f"{y_axis['high']} and {x_axis['low']}",
        f"{y_axis['high']} and {x_axis['high']}",
        f"{y_axis['low']} and {x_axis['low']}",
        f"{y_axis['low']} and {x_axis['high']}",
    ]
    said = " ".join(
        f"{place}: {q['label']}" + (f" ({q['detail']})." if "detail" in q else ".")
        for place, q in zip(where, quadrants, strict=True)
    )
    return {
        "type": kind,
        "title": title,
        "xAxis": x_axis,
        "yAxis": y_axis,
        "quadrants": quadrants,
        "alt": (
            f"{title}. A two-by-two grid of {y_axis['label']} against {x_axis['label']}. {said}"
        ),
    }


def follow_ups(raw, question: str) -> list[str]:
    """Up to three distinct suggested questions, none repeating the one just asked."""
    seen = {question.strip().lower()}
    kept: list[str] = []
    for item in raw if isinstance(raw, list) else []:
        text = _clean(item, DETAIL)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            kept.append(text)
    return kept[:3]
