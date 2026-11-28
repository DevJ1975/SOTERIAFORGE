"""Whether a quiz can actually be answered correctly.

`QuestionListSerializer` checks the shape; this checks that every question has a
right answer the grader (`grading.is_correct`) can reach. The MCP quiz tools require
it, so an assistant can't save a quiz that no learner could pass.
"""


def answerable_errors(questions: list[dict]) -> list[str]:
    if not questions:
        return ["A quiz needs at least one question."]
    errors = []
    for i, q in enumerate(questions):
        where = f"questions[{i}] ({q['id']})"
        options = q.get("options") or []
        ids = [o["id"] for o in options]
        key = q.get("answerKey") or []
        correct = [o["id"] for o in options if o.get("isCorrect")]
        kind = q["type"]
        if len(ids) != len(set(ids)):
            errors.append(f"{where}: option ids must be unique.")
        if kind in ("mcq", "true_false"):
            if len(options) < 2 or len(correct) != 1:
                errors.append(f"{where}: needs at least 2 options, exactly one with isCorrect.")
        elif kind == "multi_select":
            if len(options) < 2 or not correct:
                errors.append(f"{where}: needs at least 2 options, one or more with isCorrect.")
        elif kind == "ordering":
            if len(options) < 2 or sorted(key) != sorted(ids) or len(key) != len(set(key)):
                errors.append(
                    f"{where}: answerKey must list every option id once, in the right order."
                )
        elif kind == "matching":
            pairs = [pair.partition(":") for pair in key]
            lefts = [left.strip() for left, _, _ in pairs]
            if (
                len(key) < 2
                or any(not (sep and a.strip() and b.strip()) for a, sep, b in pairs)
                or any(len(pair) > 200 for pair in key)
            ):
                errors.append(
                    f'{where}: answerKey must hold 2 or more "left:right" pairs '
                    "(both sides filled in, at most 200 characters each pair)."
                )
            elif len(lefts) != len(set(lefts)):
                errors.append(f"{where}: each left-hand item may appear in only one pair.")
        elif kind == "fill_in" and not any(a.strip() for a in key):
            errors.append(f"{where}: answerKey must hold at least one accepted answer.")
    return errors
