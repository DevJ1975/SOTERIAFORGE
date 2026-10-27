"""Deep-copy a library course into a tenant as a draft.

Everything gets a new id and the target tenant, so nothing in the tenant is ever
overwritten. Quizzes (and the games and uploaded files a lesson points at) are
copied along; a quiz or game shared by several lessons is copied once.
"""

import contextlib
import uuid

from apps.assessments.models import Quiz
from apps.assets.models import Asset, parse_asset_ref
from apps.games.models import Game
from apps.learning.models import Course, Lesson, Module, PublishStatus


def copy_course(source: Course, tenant, actor) -> Course:
    course = Course.objects.create(
        tenant=tenant,
        title=source.title,
        description=source.description,
        status=PublishStatus.DRAFT,
        tags=source.tags,
        available_offline=source.available_offline,
        created_by=actor,
    )
    quizzes: dict = {}
    games: dict = {}
    assets: dict = {}

    def quiz_for(quiz: Quiz) -> Quiz:
        if quiz.pk not in quizzes:
            quizzes[quiz.pk] = Quiz.objects.create(
                tenant=tenant,
                title=quiz.title,
                questions=quiz.questions,
                pass_threshold=quiz.pass_threshold,
                max_attempts=quiz.max_attempts,
                created_by=actor,
            )
        return quizzes[quiz.pk]

    def asset_ref_for(ref: str, content_type: str) -> str:
        if content_type == "game":
            game = None
            with contextlib.suppress(ValueError):  # legacy free-form reference: keep as is
                game = Game.objects.filter(tenant_id=source.tenant_id, pk=uuid.UUID(ref)).first()
            if game is None:
                return ref
            if game.pk not in games:
                games[game.pk] = Game.objects.create(
                    tenant=tenant,
                    title=game.title,
                    engine=game.engine,
                    config=game.config,
                    asset_refs=game.asset_refs,
                    rive_asset_ref=game.rive_asset_ref,
                    created_by=actor,
                )
            return str(games[game.pk].pk)
        asset_id = parse_asset_ref(ref)
        if asset_id is None:
            return ref
        original = Asset.objects.filter(tenant_id=source.tenant_id, pk=asset_id).first()
        if original is None:
            return ref
        if original.pk not in assets:
            # Same stored object, new row: the tenant owns its own reference.
            assets[original.pk] = Asset.objects.create(
                tenant=tenant,
                key=original.key,
                filename=original.filename,
                content_type=original.content_type,
                size=original.size,
                created_by=actor,
            )
        return assets[original.pk].ref

    for module in source.modules.all():
        new_module = Module.objects.create(
            tenant=tenant,
            course=course,
            title=module.title,
            label=module.label,
            order=module.order,
        )
        for lesson in module.lessons.select_related("quiz").all():
            Lesson.objects.create(
                tenant=tenant,
                module=new_module,
                title=lesson.title,
                order=lesson.order,
                content_type=lesson.content_type,
                asset_ref=asset_ref_for(lesson.asset_ref, lesson.content_type),
                external_url=lesson.external_url,
                scorm_version=lesson.scorm_version,
                estimated_minutes=lesson.estimated_minutes,
                xp_reward=lesson.xp_reward,
                framework_tags=lesson.framework_tags,
                key_points=lesson.key_points,
                quiz=quiz_for(lesson.quiz) if lesson.quiz else None,
            )
    return course
