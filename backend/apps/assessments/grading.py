"""Server-authoritative grading: a port of `gradeQuiz` (libs/shared/src/lib/util/quiz-grading.ts).

Pure and deterministic. The client may grade for preview, but only this result
is stored (anti-cheat).
"""

from dataclasses import asdict, dataclass

from rest_framework import serializers

# Keep aligned with QUESTION_TYPES in libs/shared/src/lib/constants.ts.
QUESTION_TYPES = ["mcq", "multi_select", "true_false", "ordering", "matching", "fill_in"]


class OptionSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=100)
    text = serializers.CharField(allow_blank=True, max_length=2000)
    isCorrect = serializers.BooleanField(required=False)


class FeedbackSerializer(serializers.Serializer):
    correct = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    incorrect = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class QuestionSerializer(serializers.Serializer):
    """`quizQuestion` in libs/shared/src/lib/schemas/quiz.ts."""

    id = serializers.CharField(max_length=100)
    type = serializers.ChoiceField(choices=QUESTION_TYPES)
    prompt = serializers.CharField(max_length=5000)
    points = serializers.IntegerField(min_value=0, default=1)
    options = OptionSerializer(many=True, default=list)
    answerKey = serializers.ListField(child=serializers.CharField(), default=list)
    feedback = FeedbackSerializer(required=False)


class QuestionListSerializer(serializers.ListSerializer):
    child = QuestionSerializer()

    def validate(self, attrs):
        ids = [q["id"] for q in attrs]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Question ids must be unique.")
        return attrs


class MalformedQuiz(Exception):
    pass


def parse_questions(raw) -> list[dict]:
    """Validate stored questions; raises MalformedQuiz instead of grading bad data."""
    parsed = QuestionListSerializer(data=raw)
    if not isinstance(raw, list) or not parsed.is_valid():
        raise MalformedQuiz()
    return [dict(q) for q in parsed.validated_data]


class ResponseSerializer(serializers.Serializer):
    """A learner's answer to one question (`QuizResponse`)."""

    questionId = serializers.CharField(max_length=100)
    selectedOptionIds = serializers.ListField(
        child=serializers.CharField(max_length=200), required=False, max_length=200
    )
    text = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    order = serializers.ListField(
        child=serializers.CharField(max_length=100), required=False, max_length=200
    )


@dataclass(frozen=True)
class QuestionResult:
    questionId: str  # noqa: N815 (API field name)
    correct: bool
    awardedPoints: int  # noqa: N815


@dataclass(frozen=True)
class Grade:
    earned_points: int
    total_points: int
    score_pct: int
    passed: bool
    per_question: list[QuestionResult]

    def per_question_json(self) -> list[dict]:
        return [asdict(r) for r in self.per_question]


def _norm(s: str) -> str:
    return s.strip().lower()


def _same_set(a: list[str], b: list[str]) -> bool:
    return len(a) == len(b) and sorted(a) == sorted(b)


def is_correct(question: dict, response: dict | None) -> bool:
    if not response:
        return False
    correct_ids = [o["id"] for o in question["options"] if o.get("isCorrect")]
    selected = response.get("selectedOptionIds") or []
    kind = question["type"]
    if kind in ("mcq", "true_false"):
        return len(selected) == 1 and selected[0] in correct_ids
    if kind == "multi_select":
        return _same_set(selected, correct_ids)
    if kind == "ordering":
        # answerKey is the option ids in the correct order.
        return list(response.get("order") or []) == list(question["answerKey"])
    if kind == "matching":
        # answerKey holds the correct "left:right" pairs.
        return _same_set(selected, question["answerKey"])
    if kind == "fill_in":
        text = response.get("text")
        return bool(text) and any(_norm(a) == _norm(text) for a in question["answerKey"])
    return False


def grade(questions: list[dict], responses: list[dict], pass_threshold: int) -> Grade:
    by_id = {r["questionId"]: r for r in responses}
    earned = total = 0
    results = []
    for q in questions:
        total += q["points"]
        correct = is_correct(q, by_id.get(q["id"]))
        awarded = q["points"] if correct else 0
        earned += awarded
        results.append(QuestionResult(q["id"], correct, awarded))
    # Math.round in the TypeScript original rounds .5 up; match it.
    score = int(earned * 100 / total + 0.5) if total else 0
    return Grade(earned, total, score, score >= pass_threshold, results)


def public_question(question: dict) -> dict:
    """A question as learners see it: no correct flags, answer key or feedback."""
    return {
        "id": question["id"],
        "type": question["type"],
        "prompt": question["prompt"],
        "points": question["points"],
        "options": [{"id": o["id"], "text": o["text"]} for o in question["options"]],
    }
