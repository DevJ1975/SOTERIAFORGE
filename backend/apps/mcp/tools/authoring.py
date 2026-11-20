"""Quiz and game tools (instructors and tenant admins).

A quiz or game reaches learners only through a lesson, and only once a person has
published the course. So new ones are safe to create freely; changing one that a
published or archived course already uses is refused, because it would silently
change what enrolled learners are graded on.
"""

from typing import Annotated, Any, Literal

from django.core.exceptions import ValidationError
from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel, Field

from apps.assessments.authoring import answerable_errors
from apps.assessments.grading import QUESTION_TYPES
from apps.assessments.models import Quiz
from apps.assessments.serializers import QuizSerializer
from apps.audit.models import record
from apps.games.models import CARD_GAME_KINDS, Game
from apps.games.serializers import GameSerializer
from apps.games.validation import card_game_errors
from apps.learning.models import Lesson, PublishStatus

from ..principal import Principal, run
from .common import READ, UNTRUSTED, WRITE, Id, Title, author, checked, given, one

IN_USE = (
    " Refused if a published or archived course uses it; create a new one and attach it to a "
    "draft lesson instead."
)


class Option(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=100)]
    text: Annotated[str, Field(max_length=2000)]
    isCorrect: bool = False  # noqa: N815 (stored field name)


class Feedback(BaseModel):
    correct: Annotated[str, Field(max_length=2000)] = ""
    incorrect: Annotated[str, Field(max_length=2000)] = ""


class Question(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=100, description="Unique in the quiz.")]
    type: Literal[tuple(QUESTION_TYPES)]  # type: ignore[valid-type]
    prompt: Annotated[str, Field(min_length=1, max_length=5000)]
    points: Annotated[int, Field(ge=0, le=100)] = 1
    options: Annotated[
        list[Option],
        Field(
            max_length=20,
            description="mcq/true_false: exactly one isCorrect. multi_select: one or more. "
            "ordering: the items to order. matching/fill_in: leave empty.",
        ),
    ] = []
    answerKey: Annotated[  # noqa: N815
        list[str],
        Field(
            max_length=50,
            description='ordering: option ids in the right order. matching: "left:right" '
            "pairs. fill_in: accepted answers (case-insensitive). Otherwise empty.",
        ),
    ] = []
    feedback: Feedback | None = None


Questions = Annotated[list[Question], Field(min_length=1, max_length=100)]
Threshold = Annotated[int, Field(ge=0, le=100, description="Percent needed to pass.")]
Attempts = Annotated[int, Field(ge=1, le=100)]
GameConfig = Annotated[
    dict[str, Any],
    Field(
        description="Card-game config with `kind` (" + ", ".join(CARD_GAME_KINDS) + ") and "
        "`title`. flip_reveal: cards[{id,label,revealText}]. match_pairs: pairs[{id,"
        "question:{id,label},answer:{id,label}}] (2+). sort_buckets: cards[{id,label}], "
        "buckets[{id,label,correctCardIds}] (2+). scenario_cards: scenarios[{id,prompt,"
        "choices[{id,text,isCorrect,feedback}]}] (2+ choices, one correct)."
    ),
]


def _audit(p: Principal, action: str, target, **details) -> None:
    record(action=action, actor=p.member, tenant=p.tenant, target=target, via="mcp", **details)


def _live_lessons(tenant, **lookup):
    return Lesson.objects.filter(tenant=tenant, **lookup).exclude(
        module__course__status=PublishStatus.DRAFT
    )


def _questions(questions: list[Question]) -> list[dict]:
    raw = [q.model_dump(exclude_none=True) for q in questions]
    errors = answerable_errors(raw)
    if errors:
        raise ValidationError(errors)
    return raw


def quiz_json(quiz: Quiz) -> dict:
    return {**QuizSerializer(quiz).data, "id": str(quiz.pk)}


def game_json(game: Game) -> dict:
    data = GameSerializer(game).data
    return {
        "id": str(game.pk),
        "title": data["title"],
        "engine": data["engine"],
        "config": data["config"],
        "assetRefs": data["assetRefs"],
    }


def _game_config(config: dict) -> dict:
    errors = card_game_errors(config)
    if errors:
        raise ValidationError(errors)
    return config


def register(server: MCPServer) -> None:
    @server.tool(
        annotations=READ,
        description="Quizzes in your organization, with how many lessons use each.",
    )
    async def forge_list_quizzes() -> dict:
        def go(p: Principal):
            tenant = author(p)
            return {
                "quizzes": [
                    {
                        "id": str(q.pk),
                        "title": q.title,
                        "questionCount": len(q.questions or []),
                        "passThreshold": q.pass_threshold,
                        "maxAttempts": q.max_attempts,
                        "lessonCount": Lesson.objects.filter(tenant=tenant, quiz=q).count(),
                    }
                    for q in Quiz.objects.filter(tenant=tenant)[:500]
                ]
            }

        return await run(go)

    @server.tool(
        annotations=READ,
        description="One quiz with its questions and answer key (staff only)." + UNTRUSTED,
    )
    async def forge_get_quiz(quiz_id: Id) -> dict:
        return await run(
            lambda p: quiz_json(one(Quiz.objects.filter(tenant=author(p)), "quiz", pk=quiz_id))
        )

    @server.tool(
        annotations=WRITE,
        description="Create a quiz. Learners don't see it until you attach it to a lesson "
        "(forge_add_lesson / forge_update_lesson with quiz_id) and a person publishes the course.",
    )
    async def forge_create_quiz(
        title: Title,
        questions: Questions,
        pass_threshold: Threshold = 70,
        max_attempts: Attempts | None = None,
    ) -> dict:
        def go(p: Principal):
            tenant = author(p)
            data = checked(
                QuizSerializer(
                    data={
                        "title": title,
                        "questions": _questions(questions),
                        "passThreshold": pass_threshold,
                        "maxAttempts": max_attempts,
                    }
                )
            )
            quiz = Quiz.objects.create(tenant=tenant, created_by=p.member, **data)
            _audit(p, "assessments.quiz.created", quiz, questions=len(questions))
            return quiz_json(quiz)

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Change a quiz. `questions` replaces the whole list when given." + IN_USE,
    )
    async def forge_update_quiz(
        quiz_id: Id,
        title: Title | None = None,
        questions: Questions | None = None,
        pass_threshold: Threshold | None = None,
        max_attempts: Attempts | None = None,
    ) -> dict:
        def go(p: Principal):
            tenant = author(p)
            quiz = one(Quiz.objects.select_for_update().filter(tenant=tenant), "quiz", pk=quiz_id)
            if _live_lessons(tenant, quiz=quiz).exists():
                raise ValidationError(
                    "A published or archived course uses this quiz, so it can't be changed here. "
                    "Create a new quiz, or edit this one in the admin app."
                )
            body = given(title=title, passThreshold=pass_threshold, maxAttempts=max_attempts)
            if questions is not None:
                body["questions"] = _questions(questions)
            for field, value in checked(QuizSerializer(quiz, data=body, partial=True)).items():
                setattr(quiz, field, value)
            quiz.save()
            _audit(p, "assessments.quiz.updated", quiz, fields=sorted(body))
            return quiz_json(quiz)

        return await run(go)

    @server.tool(annotations=READ, description="Games in your organization." + UNTRUSTED)
    async def forge_list_games() -> dict:
        def go(p: Principal):
            return {
                "games": [
                    {"id": str(g.pk), "title": g.title, "kind": (g.config or {}).get("kind")}
                    for g in Game.objects.filter(tenant=author(p))[:500]
                ]
            }

        return await run(go)

    @server.tool(annotations=READ, description="One game with its full config." + UNTRUSTED)
    async def forge_get_game(game_id: Id) -> dict:
        return await run(
            lambda p: game_json(one(Game.objects.filter(tenant=author(p)), "game", pk=game_id))
        )

    @server.tool(
        annotations=WRITE,
        description="Create a card game (flip_reveal, match_pairs, sort_buckets or "
        "scenario_cards). The config must be complete and playable. Learners see it once a "
        "lesson with content_type game points at its id and a person publishes the course.",
    )
    async def forge_create_game(title: Title, config: GameConfig) -> dict:
        def go(p: Principal):
            tenant = author(p)
            data = checked(
                GameSerializer(
                    data={"title": title, "engine": "phaser", "config": _game_config(config)}
                )
            )
            game = Game.objects.create(tenant=tenant, created_by=p.member, **data)
            _audit(p, "games.game.created", game, kind=config["kind"])
            return game_json(game)

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Change a card game's title or replace its config." + IN_USE,
    )
    async def forge_update_game(
        game_id: Id, title: Title | None = None, config: GameConfig | None = None
    ) -> dict:
        def go(p: Principal):
            tenant = author(p)
            game = one(Game.objects.select_for_update().filter(tenant=tenant), "game", pk=game_id)
            if _live_lessons(tenant, content_type="game", asset_ref=str(game.pk)).exists():
                raise ValidationError(
                    "A published or archived course uses this game, so it can't be changed here. "
                    "Create a new game, or edit this one in the admin app."
                )
            body = given(title=title)
            if config is not None:
                body["config"] = _game_config(config)
            for field, value in checked(GameSerializer(game, data=body, partial=True)).items():
                setattr(game, field, value)
            game.save()
            _audit(p, "games.game.updated", game, fields=sorted(body))
            return game_json(game)

        return await run(go)
