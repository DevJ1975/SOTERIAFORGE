"""Port of libs/shared/src/lib/util/quiz-grading.spec.ts."""

import pytest

from apps.assessments.grading import MalformedQuiz, grade, parse_questions, public_question

QUESTIONS = [
    {
        "id": "m",
        "type": "mcq",
        "prompt": "Pick A",
        "points": 1,
        "options": [{"id": "a", "text": "A", "isCorrect": True}, {"id": "b", "text": "B"}],
        "answerKey": [],
    },
    {
        "id": "ms",
        "type": "multi_select",
        "prompt": "Pick A and C",
        "points": 2,
        "options": [
            {"id": "a", "text": "A", "isCorrect": True},
            {"id": "b", "text": "B"},
            {"id": "c", "text": "C", "isCorrect": True},
        ],
        "answerKey": [],
    },
    {
        "id": "fi",
        "type": "fill_in",
        "prompt": "Capital of France?",
        "points": 1,
        "options": [],
        "answerKey": ["Paris"],
    },
]


def by_id(result, qid):
    return next(r for r in result.per_question if r.questionId == qid)


def test_fully_correct_submission_is_100_and_passed():
    result = grade(
        QUESTIONS,
        [
            {"questionId": "m", "selectedOptionIds": ["a"]},
            {"questionId": "ms", "selectedOptionIds": ["c", "a"]},
            {"questionId": "fi", "text": "paris"},
        ],
        70,
    )
    assert (result.earned_points, result.total_points, result.score_pct) == (4, 4, 100)
    assert result.passed


def test_multi_select_requires_the_exact_set():
    result = grade(QUESTIONS, [{"questionId": "ms", "selectedOptionIds": ["a"]}], 70)
    assert not by_id(result, "ms").correct


def test_fill_in_ignores_case_and_surrounding_space():
    result = grade(QUESTIONS, [{"questionId": "fi", "text": "  PARIS "}], 70)
    assert by_id(result, "fi").correct


def test_pass_fail_uses_the_threshold():
    result = grade(QUESTIONS, [{"questionId": "m", "selectedOptionIds": ["a"]}], 70)
    assert (result.score_pct, result.passed) == (25, False)


def test_ordering_must_match_the_answer_key_order():
    ordering = [
        {
            "id": "o",
            "type": "ordering",
            "prompt": "Order",
            "points": 1,
            "options": [{"id": "x", "text": "X"}, {"id": "y", "text": "Y"}],
            "answerKey": ["x", "y"],
        }
    ]
    assert grade(ordering, [{"questionId": "o", "order": ["x", "y"]}], 100).passed
    assert not grade(ordering, [{"questionId": "o", "order": ["y", "x"]}], 100).passed


def test_mcq_with_two_selections_is_wrong():
    result = grade(QUESTIONS, [{"questionId": "m", "selectedOptionIds": ["a", "b"]}], 70)
    assert not by_id(result, "m").correct


def test_missing_responses_score_zero():
    assert grade(QUESTIONS, [], 70).score_pct == 0


def test_score_rounds_half_up_like_math_round():
    # 1 of 8 points = 12.5% -> 13 (Python's round() would give 12).
    questions = [dict(QUESTIONS[0], points=1)] + [
        dict(QUESTIONS[0], id=f"x{i}", points=1) for i in range(7)
    ]
    assert grade(questions, [{"questionId": "m", "selectedOptionIds": ["a"]}], 70).score_pct == 13


@pytest.mark.parametrize(
    "raw",
    [
        None,
        {"not": "a list"},
        [{"id": "q", "type": "essay", "prompt": "?"}],
        [{"id": "q", "type": "mcq"}],
        [{"id": "q", "type": "mcq", "prompt": "a"}, {"id": "q", "type": "mcq", "prompt": "b"}],
    ],
)
def test_malformed_questions_are_refused(raw):
    with pytest.raises(MalformedQuiz):
        parse_questions(raw)


def test_public_question_hides_the_answers():
    shown = public_question(parse_questions(QUESTIONS)[1])
    assert shown["options"] == [
        {"id": "a", "text": "A"},
        {"id": "b", "text": "B"},
        {"id": "c", "text": "C"},
    ]
    assert "answerKey" not in shown and "feedback" not in shown
