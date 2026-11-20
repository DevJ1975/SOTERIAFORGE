"""Card-game config rules: a port of `validateCardGameConfig`
(libs/games/src/lib/card-game.model.ts). Keep the two aligned; the messages match
so authors see the same text from the admin editor, the API and the MCP tools.
"""

from .models import CARD_GAME_KINDS


def _text(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _items(value) -> list:
    """List entries that are objects; anything else is reported as a missing field."""
    return [v if isinstance(v, dict) else {} for v in value] if isinstance(value, list) else []


def _number(value) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _unique(ids: list) -> bool:
    return len({str(i) for i in ids}) == len(ids)


def _flip_reveal(cfg: dict) -> list[str]:
    errors = []
    cards = _items(cfg.get("cards"))
    if not cards:
        errors.append("flip_reveal: at least one card is required")
    for i, card in enumerate(cards):
        if not _text(card.get("id")):
            errors.append(f"flip_reveal.cards[{i}]: id is required")
        if not _text(card.get("label")) and not card.get("imageUrl"):
            errors.append(f"flip_reveal.cards[{i}]: label or imageUrl is required")
        if not _text(card.get("revealText")):
            errors.append(f"flip_reveal.cards[{i}]: revealText is required")
    if cards and not _unique([c.get("id") for c in cards]):
        errors.append("flip_reveal: card ids must be unique")
    visible = cfg.get("visibleCount")
    if visible is not None and (not _number(visible) or visible < 1):
        errors.append("flip_reveal: visibleCount must be >= 1")
    return errors


def _match_pairs(cfg: dict) -> list[str]:
    errors = []
    pairs = _items(cfg.get("pairs"))
    if len(pairs) < 2:
        errors.append("match_pairs: at least 2 pairs are required")
    else:
        for i, pair in enumerate(pairs):
            if not _text(pair.get("id")):
                errors.append(f"match_pairs.pairs[{i}]: id is required")
            for side in ("question", "answer"):
                card = pair.get(side)
                if not isinstance(card, dict) or not _text(card.get("id")):
                    errors.append(f"match_pairs.pairs[{i}].{side}: id is required")
        if not _unique([p.get("id") for p in pairs]):
            errors.append("match_pairs: pair ids must be unique")
    limit = cfg.get("timeLimitSeconds")
    if limit is not None and (not _number(limit) or limit < 0):
        errors.append("match_pairs: timeLimitSeconds must be >= 0")
    return errors


def _sort_buckets(cfg: dict) -> list[str]:
    errors = []
    cards = _items(cfg.get("cards"))
    buckets = _items(cfg.get("buckets"))
    if not cards:
        errors.append("sort_buckets: at least one card is required")
    if len(buckets) < 2:
        errors.append("sort_buckets: at least 2 buckets are required")
    card_ids = [c.get("id") for c in cards]
    for i, bucket in enumerate(buckets):
        if not _text(bucket.get("id")):
            errors.append(f"sort_buckets.buckets[{i}]: id is required")
        if not _text(bucket.get("label")):
            errors.append(f"sort_buckets.buckets[{i}]: label is required")
        correct = bucket.get("correctCardIds")
        for card_id in correct if isinstance(correct, list) else []:
            if card_id not in card_ids:
                errors.append(
                    f'sort_buckets.buckets[{i}]: correctCardId "{card_id}" not found in cards'
                )
    if not _unique(card_ids):
        errors.append("sort_buckets: card ids must be unique")
    return errors


def _scenario_cards(cfg: dict) -> list[str]:
    errors = []
    scenarios = _items(cfg.get("scenarios"))
    if not scenarios:
        errors.append("scenario_cards: at least one scenario is required")
    for i, scenario in enumerate(scenarios):
        where = f"scenario_cards.scenarios[{i}]"
        if not _text(scenario.get("id")):
            errors.append(f"{where}: id is required")
        if not _text(scenario.get("prompt")):
            errors.append(f"{where}: prompt is required")
        choices = _items(scenario.get("choices"))
        if len(choices) < 2:
            errors.append(f"{where}: at least 2 choices are required")
            continue
        if not any(c.get("isCorrect") is True for c in choices):
            errors.append(f"{where}: at least one choice must be correct")
        for j, choice in enumerate(choices):
            if not _text(choice.get("id")):
                errors.append(f"{where}.choices[{j}]: id is required")
            if not _text(choice.get("text")):
                errors.append(f"{where}.choices[{j}]: text is required")
    return errors


_RULES = {
    "flip_reveal": _flip_reveal,
    "match_pairs": _match_pairs,
    "sort_buckets": _sort_buckets,
    "scenario_cards": _scenario_cards,
}
assert set(_RULES) == set(CARD_GAME_KINDS)


def card_game_errors(config: dict) -> list[str]:
    """Problems with a card-game config; empty when it is valid."""
    kind = config.get("kind")
    if kind not in _RULES:
        return [f"Unknown card game kind {kind!r}."]
    errors = [] if _text(config.get("title")) else [f"{kind}: title is required"]
    return errors + _RULES[kind](config)
