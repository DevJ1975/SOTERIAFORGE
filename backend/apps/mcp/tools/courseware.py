"""Courseware tools: read and draft course content (instructors and tenant admins).

No publish, unpublish, archive or delete-a-course tool exists on purpose; a person
does those in the admin app. New courses are always drafts. Edits to a published
course are live, and the write tools say so.

Input rules come from the REST serializers (`apps/learning/serializers.py`), so the
admin app and an assistant are held to the same ones.
"""

from typing import Annotated, Literal

from django.core.exceptions import ValidationError
from django.db.models import Max, Prefetch
from django.db.models.deletion import ProtectedError
from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel, Field

from apps.assessments.models import Quiz
from apps.assets.models import ASSET_REF_PREFIX, Asset, parse_asset_ref
from apps.audit.models import record
from apps.games.models import Game
from apps.learning.models import CONTENT_TYPES, Course, Lesson, Module, PublishStatus
from apps.learning.serializers import CourseSerializer, LessonWriteSerializer, ModuleSerializer

from ..principal import Principal, run
from .common import LIVE, READ, REMOVE, UNTRUSTED, WRITE, Id, Title, author, checked, given, one

Tags = Annotated[list[str], Field(max_length=30, description="Short topic tags.")]
Xp = Annotated[int, Field(ge=0, le=1000, description="XP for the first completion.")]
Minutes = Annotated[int, Field(ge=0, le=600)]
Kind = Literal[tuple(CONTENT_TYPES)]  # type: ignore[valid-type]
FrameworkTags = Annotated[
    list[str],
    Field(max_length=30, description='Standards the lesson covers, e.g. "OSHA 1910.147".'),
]
Transcript = Annotated[
    str,
    Field(
        max_length=100_000,
        description="Narration script or transcript of a video/audio lesson (Markdown or text).",
    ),
]
AssetRef = Annotated[
    str,
    Field(
        max_length=1024,
        description='What the lesson plays: "asset:<id>" from forge_import_media or '
        "forge_list_assets, or a game id from forge_create_game when content_type is game.",
    ),
]


class KeyPoint(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    body: Annotated[str, Field(max_length=2000)] = ""


KeyPoints = Annotated[
    list[KeyPoint], Field(max_length=20, description="Takeaways to remember, in order.")
]


# --- reading -------------------------------------------------------------------


def lesson_json(lesson: Lesson) -> dict:
    return {
        "id": str(lesson.pk),
        "moduleId": str(lesson.module_id),
        "title": lesson.title,
        "order": lesson.order,
        "contentType": lesson.content_type,
        "assetRef": lesson.asset_ref,
        "externalUrl": lesson.external_url,
        "estimatedMinutes": lesson.estimated_minutes,
        "xpReward": lesson.xp_reward,
        "frameworkTags": lesson.framework_tags,
        "keyPoints": lesson.key_points,
        "transcript": lesson.transcript,
        "quizId": str(lesson.quiz_id) if lesson.quiz_id else None,
    }


def module_json(module: Module) -> dict:
    return {
        **ModuleSerializer(module).data,
        "id": str(module.pk),
        "courseId": str(module.course_id),
    }


def course_json(course: Course) -> dict:
    return {**CourseSerializer(course).data, "id": str(course.pk)}


def course_tree(course: Course) -> dict:
    modules = course.modules.prefetch_related(
        Prefetch("lessons", queryset=Lesson.objects.order_by("order", "created_at"))
    )
    return {
        **course_json(course),
        "modules": [
            {**module_json(m), "lessons": [lesson_json(x) for x in m.lessons.all()]}
            for m in modules
        ],
    }


def _course(tenant, course_id) -> Course:
    return one(Course.objects.filter(tenant=tenant), "course", pk=course_id)


def _module(tenant, module_id) -> Module:
    return one(
        Module.objects.select_related("course").filter(tenant=tenant), "module", pk=module_id
    )


def _lesson(tenant, lesson_id) -> Lesson:
    lessons = Lesson.objects.select_related("module__course").filter(tenant=tenant)
    return one(lessons, "lesson", pk=lesson_id)


# --- writing -------------------------------------------------------------------


def _audit(p: Principal, action: str, target, **details) -> None:
    record(action=action, actor=p.member, tenant=p.tenant, target=target, via="mcp", **details)


def _draft_only(course: Course, what: str) -> None:
    if course.status != PublishStatus.DRAFT:
        raise ValidationError(
            f"This course is {course.status}, so its {what} can't be removed here; "
            "unpublish it in the admin app first."
        )


def _next_order(queryset) -> int:
    last = queryset.aggregate(last=Max("order"))["last"]
    return 0 if last is None else last + 1


def _reorder(rows: list, ids: list[str], what: str) -> None:
    by_id = {str(r.pk): r for r in rows}
    if len(ids) != len(by_id) or set(ids) != set(by_id):
        raise ValidationError(f"List every {what} id of this parent exactly once.")
    for order, row_id in enumerate(ids):
        row = by_id[row_id]
        if row.order != order:
            row.order = order
            row.save(update_fields=["order", "updated_at"])


def _lesson_fields(tenant, body: dict, lesson: Lesson | None) -> dict:
    """Validated model fields for a lesson create or update."""
    data = checked(LessonWriteSerializer(lesson, data=body, partial=lesson is not None))
    if lesson is not None and hasattr(lesson, "binding"):
        locked = {"content_type", "scorm_version", "quizId", "asset_ref", "external_url"}
        if locked & data.keys():
            raise ValidationError(
                "Package lessons have immutable content. Attach a new package version in the "
                "admin app."
            )
    url = data.get("external_url")
    if url and not url.startswith("https://"):
        raise ValidationError("external_url must start with https://.")
    kind = data.get("content_type", lesson.content_type if lesson else None)
    ref = data.get("asset_ref")
    if ref:
        if ref.startswith(ASSET_REF_PREFIX):
            asset_id = parse_asset_ref(ref)
            one(Asset.objects.filter(tenant=tenant), "asset", pk=asset_id)
        elif kind == "game":
            one(Game.objects.filter(tenant=tenant), "game", pk=ref)
    if "quizId" in data:
        quiz_id = data.pop("quizId")
        data["quiz"] = (
            one(Quiz.objects.filter(tenant=tenant), "quiz", pk=quiz_id) if quiz_id else None
        )
    return data


def _lesson_body(**fields) -> dict:
    """Tool arguments (snake_case, None = not given) as the serializer's camelCase body."""
    names = {
        "title": "title",
        "content_type": "contentType",
        "external_url": "externalUrl",
        "asset_ref": "assetRef",
        "estimated_minutes": "estimatedMinutes",
        "xp_reward": "xpReward",
        "framework_tags": "frameworkTags",
        "key_points": "keyPoints",
        "transcript": "transcript",
    }
    body = {names[k]: v for k, v in given(**fields).items()}
    if "keyPoints" in body:
        body["keyPoints"] = [kp.model_dump() for kp in body["keyPoints"]]
    return body


def register(server: MCPServer) -> None:
    @server.tool(annotations=READ, description="List courses in your organization." + UNTRUSTED)
    async def forge_list_courses(
        status: Literal["draft", "published", "archived"] | None = None,
        search: Annotated[str, Field(max_length=100)] = "",
    ) -> dict:
        def go(p: Principal):
            courses = Course.objects.filter(tenant=author(p))
            if status:
                courses = courses.filter(status=status)
            if search:
                courses = courses.filter(title__icontains=search)
            return {"courses": [course_json(c) for c in courses[:500]]}

        return await run(go)

    @server.tool(
        annotations=READ,
        description="One course with its modules and lessons (key points, framework tags, "
        "transcript, attached quiz and asset), in learner order." + UNTRUSTED,
    )
    async def forge_get_course(course_id: Id) -> dict:
        return await run(lambda p: course_tree(_course(author(p), course_id)))

    @server.tool(
        annotations=READ, description="Framework (standards) tags in use, with lesson counts."
    )
    async def forge_list_framework_tags() -> dict:
        def go(p: Principal):
            counts: dict[str, int] = {}
            rows = Lesson.objects.filter(tenant=author(p)).values_list("framework_tags", flat=True)
            for tags in rows:
                for tag in tags or []:
                    counts[tag] = counts.get(tag, 0) + 1
            return {
                "frameworkTags": [
                    {"tag": tag, "lessonCount": n} for tag, n in sorted(counts.items())
                ]
            }

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Create a new course. It is always a draft; a person publishes it in Forge "
        "admin.",
    )
    async def forge_create_course_draft(
        title: Title,
        description: Annotated[str, Field(max_length=5000)] = "",
        tags: Tags | None = None,
        available_offline: bool = False,
    ) -> dict:
        def go(p: Principal):
            tenant = author(p)
            data = checked(
                CourseSerializer(
                    data={
                        "title": title,
                        "description": description,
                        "tags": tags or [],
                        "availableOffline": available_offline,
                    }
                )
            )
            course = Course.objects.create(
                tenant=tenant, created_by=p.member, status=PublishStatus.DRAFT, **data
            )
            _audit(p, "learning.course.created", course)
            return course_json(course)

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Change a course's title, description, tags or offline availability. "
        "Can't change its status." + LIVE,
    )
    async def forge_update_course(
        course_id: Id,
        title: Title | None = None,
        description: Annotated[str, Field(max_length=5000)] | None = None,
        tags: Tags | None = None,
        available_offline: bool | None = None,
    ) -> dict:
        body = given(
            title=title, description=description, tags=tags, availableOffline=available_offline
        )

        def go(p: Principal):
            course = _course(author(p), course_id)
            data = checked(CourseSerializer(course, data=body, partial=True))
            for field, value in data.items():
                setattr(course, field, value)
            course.save()
            _audit(p, "learning.course.updated", course, fields=sorted(body))
            return course_json(course)

        return await run(go)

    @server.tool(
        annotations=WRITE, description="Append a module (a section of lessons) to a course." + LIVE
    )
    async def forge_add_module(
        course_id: Id,
        title: Title,
        label: Annotated[
            str, Field(max_length=100, description='Shown above the title, e.g. "Week 5".')
        ] = "",
    ) -> dict:
        def go(p: Principal):
            course = _course(author(p), course_id)
            data = checked(ModuleSerializer(data={"title": title, "label": label}))
            module = Module.objects.create(
                tenant=course.tenant, course=course, order=_next_order(course.modules), **data
            )
            _audit(p, "learning.module.created", module, course=str(course.pk))
            return module_json(module)

        return await run(go)

    @server.tool(annotations=WRITE, description="Rename a module or change its label." + LIVE)
    async def forge_update_module(
        module_id: Id,
        title: Title | None = None,
        label: Annotated[str, Field(max_length=100)] | None = None,
    ) -> dict:
        body = given(title=title, label=label)

        def go(p: Principal):
            module = _module(author(p), module_id)
            for field, value in checked(ModuleSerializer(module, data=body, partial=True)).items():
                setattr(module, field, value)
            module.save()
            _audit(p, "learning.module.updated", module, fields=sorted(body))
            return module_json(module)

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Set the learner order of a course's modules. List every module id exactly "
        "once." + LIVE,
    )
    async def forge_reorder_modules(course_id: Id, module_ids: list[Id]) -> dict:
        def go(p: Principal):
            course = _course(author(p), course_id)
            _reorder(list(course.modules.select_for_update()), module_ids, "module")
            _audit(p, "learning.modules.reordered", course)
            return course_tree(course)

        return await run(go)

    @server.tool(
        annotations=REMOVE,
        description="Remove a module and its lessons. Only works while the course is a draft.",
    )
    async def forge_remove_module(module_id: Id) -> dict:
        def go(p: Principal):
            module = _module(author(p), module_id)
            _draft_only(module.course, "modules")
            course = module.course
            _audit(p, "learning.module.deleted", module, title=module.title)
            _delete(module)
            _reorder(
                list(course.modules.all()), [str(m.pk) for m in course.modules.all()], "module"
            )
            return {"removed": module_id}

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Append a lesson to a module. A video or audio lesson takes an "
        "asset_ref (or an https external_url) plus its transcript; a game lesson takes a game "
        "id as asset_ref; quiz_id attaches a quiz (graded when content_type is quiz, otherwise a "
        "knowledge check)." + LIVE,
    )
    async def forge_add_lesson(
        module_id: Id,
        title: Title,
        content_type: Kind,
        external_url: Annotated[str, Field(max_length=2048, description="https:// only.")]
        | None = None,
        asset_ref: AssetRef | None = None,
        quiz_id: Id | None = None,
        estimated_minutes: Minutes | None = None,
        xp_reward: Xp | None = None,
        key_points: KeyPoints | None = None,
        framework_tags: FrameworkTags | None = None,
        transcript: Transcript | None = None,
    ) -> dict:
        body = _lesson_body(
            title=title,
            content_type=content_type,
            external_url=external_url,
            asset_ref=asset_ref,
            estimated_minutes=estimated_minutes,
            xp_reward=xp_reward,
            key_points=key_points,
            framework_tags=framework_tags,
            transcript=transcript,
        )
        if quiz_id is not None:
            body["quizId"] = quiz_id

        def go(p: Principal):
            tenant = author(p)
            module = _module(tenant, module_id)
            data = _lesson_fields(tenant, body, None)
            lesson = Lesson.objects.create(
                tenant=module.tenant, module=module, order=_next_order(module.lessons), **data
            )
            _audit(p, "learning.lesson.created", lesson, module=str(module.pk))
            return lesson_json(lesson)

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Change a lesson. Only the arguments you pass change; key_points and "
        "framework_tags replace the whole list when given. detach_quiz=true removes its quiz."
        + LIVE,
    )
    async def forge_update_lesson(
        lesson_id: Id,
        title: Title | None = None,
        content_type: Kind | None = None,
        external_url: Annotated[str, Field(max_length=2048)] | None = None,
        asset_ref: AssetRef | None = None,
        quiz_id: Id | None = None,
        detach_quiz: bool = False,
        estimated_minutes: Minutes | None = None,
        xp_reward: Xp | None = None,
        key_points: KeyPoints | None = None,
        framework_tags: FrameworkTags | None = None,
        transcript: Transcript | None = None,
    ) -> dict:
        body = _lesson_body(
            title=title,
            content_type=content_type,
            external_url=external_url,
            asset_ref=asset_ref,
            estimated_minutes=estimated_minutes,
            xp_reward=xp_reward,
            key_points=key_points,
            framework_tags=framework_tags,
            transcript=transcript,
        )
        if detach_quiz:
            body["quizId"] = None
        elif quiz_id is not None:
            body["quizId"] = quiz_id

        def go(p: Principal):
            tenant = author(p)
            lesson = _lesson(tenant, lesson_id)
            for field, value in _lesson_fields(tenant, body, lesson).items():
                setattr(lesson, field, value)
            lesson.save()
            _audit(p, "learning.lesson.updated", lesson, fields=sorted(body))
            return lesson_json(lesson)

        return await run(go)

    @server.tool(
        annotations=WRITE,
        description="Set the learner order of a module's lessons. List every lesson id exactly "
        "once." + LIVE,
    )
    async def forge_reorder_lessons(module_id: Id, lesson_ids: list[Id]) -> dict:
        def go(p: Principal):
            module = _module(author(p), module_id)
            _reorder(list(module.lessons.select_for_update()), lesson_ids, "lesson")
            _audit(p, "learning.lessons.reordered", module)
            return {
                **module_json(module),
                "lessons": [lesson_json(x) for x in module.lessons.order_by("order")],
            }

        return await run(go)

    @server.tool(
        annotations=REMOVE,
        description="Remove a lesson. Only works while the course is a draft.",
    )
    async def forge_remove_lesson(lesson_id: Id) -> dict:
        def go(p: Principal):
            lesson = _lesson(author(p), lesson_id)
            _draft_only(lesson.module.course, "lessons")
            if hasattr(lesson, "binding"):
                raise ValidationError("Detach the package from this lesson in the admin app first.")
            module = lesson.module
            _audit(p, "learning.lesson.deleted", lesson, title=lesson.title)
            _delete(lesson)
            rest = list(module.lessons.order_by("order", "created_at"))
            _reorder(rest, [str(x.pk) for x in rest], "lesson")
            return {"removed": lesson_id}

        return await run(go)


def _delete(obj) -> None:
    try:
        obj.delete()
    except ProtectedError:
        raise ValidationError(
            "Learners have progress here, so it can't be removed. Archive the course in the "
            "admin app instead."
        ) from None
