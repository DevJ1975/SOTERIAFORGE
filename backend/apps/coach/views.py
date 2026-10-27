from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from pgvector.django import CosineDistance
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record
from apps.learning.access import Conflict, acting_tenant, visible_courses
from apps.learning.models import PublishStatus

from .documents import content_hash, pages_from_input, split_pages
from .models import Chunk, Source
from .profiles import catalog
from .provider import Ollama, fail, inference_slot
from .serializers import (
    AgentProfileSerializer,
    AnswerSerializer,
    CoachCourseSerializer,
    IngestResultSerializer,
    IngestSerializer,
    QuestionSerializer,
    SourceSerializer,
)


def permitted_courses(request):
    courses = visible_courses(request).filter(status=PublishStatus.PUBLISHED)
    if not request.user.can_author:
        courses = courses.filter(
            enrollments__member=request.user, enrollments__tenant=acting_tenant(request)
        )
    return courses


def private(response: Response) -> Response:
    response["Cache-Control"] = "no-store"
    return response


class TutorThrottle(UserRateThrottle):
    rate = "10/min"


class PrivateView(APIView):
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class CoursesView(PrivateView):
    @extend_schema(responses=CoachCourseSerializer(many=True))
    def get(self, request):
        return private(Response(list(permitted_courses(request).values("id", "title"))))


class ProfilesView(PrivateView):
    @extend_schema(responses=AgentProfileSerializer(many=True))
    def get(self, request):
        return private(Response(catalog()))


class StaffView(PrivateView):
    permission_classes = [IsActiveMember, HasTenantRole]
    tenant_roles = TENANT_STAFF


class SourcesView(StaffView):
    @extend_schema(responses=SourceSerializer(many=True))
    def get(self, request):
        sources = Source.objects.filter(tenant=acting_tenant(request)).annotate(
            chunk_count=Count("chunks")
        )
        return private(
            Response(
                [
                    {
                        "id": str(source.pk),
                        "courseId": str(source.course_id),
                        "title": source.title,
                        "chunkCount": source.chunk_count,
                        "updatedAt": source.updated_at.isoformat(),
                        "agent": source.agent,
                        "referenceUrl": source.reference_url,
                        "edition": source.edition,
                    }
                    for source in sources
                ]
            )
        )


class SourceView(StaffView):
    @extend_schema(request=IngestSerializer, responses=IngestResultSerializer)
    def put(self, request, source_id):
        body = IngestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        course = get_object_or_404(permitted_courses(request), pk=data["courseId"])
        tenant = acting_tenant(request)
        with inference_slot():
            pages = pages_from_input(data)
            digest = content_hash(pages)
            parts = split_pages(pages)
            provider = Ollama()
            provider.verify_models()
            old = Source.objects.filter(tenant=tenant, pk=source_id).first()
            if old and old.course_id != course.pk:
                raise ValidationError("A source cannot be moved to another course.")
            if old and old.agent != data["agent"]:
                raise ValidationError("A source cannot be moved to another agent.")
            if old and (
                old.content_hash == digest
                and old.embedding_digest == settings.COACH_EMBED_DIGEST
                and old.title == data["label"]
                and old.reference_url == data["referenceUrl"]
                and old.edition == data["edition"]
            ):
                return private(Response({"ok": True, "chunks": old.chunks.count()}))
            vectors = []
            for start in range(0, len(parts), 16):
                vectors.extend(provider.embed([text for _, text in parts[start : start + 16]]))
            with transaction.atomic():
                get_object_or_404(permitted_courses(request), pk=course.pk)
                try:
                    with transaction.atomic():
                        source, _ = Source.objects.update_or_create(
                            pk=source_id,
                            tenant=tenant,
                            defaults={
                                "course": course,
                                "title": data["label"],
                                "content_hash": digest,
                                "embedding_digest": settings.COACH_EMBED_DIGEST,
                                "approved_by": request.user,
                                "agent": data["agent"],
                                "reference_url": data["referenceUrl"],
                                "edition": data["edition"],
                            },
                        )
                except IntegrityError as error:
                    raise Conflict("Source ID unavailable. Use a new source ID.") from error
                source.chunks.all().delete()
                Chunk.objects.bulk_create(
                    [
                        Chunk(
                            tenant=tenant,
                            source=source,
                            ordinal=i,
                            page=page,
                            text=text,
                            embedding=vector,
                        )
                        for i, ((page, text), vector) in enumerate(zip(parts, vectors, strict=True))
                    ]
                )
                record(
                    action="coach.source.approved",
                    actor=request.user,
                    tenant=tenant,
                    target=source,
                    chunks=len(parts),
                    content_hash=digest,
                    agent=source.agent,
                    reference_url=source.reference_url,
                    edition=source.edition,
                )
        return private(Response({"ok": True, "chunks": len(parts)}))

    @extend_schema(responses={204: None})
    def delete(self, request, source_id):
        # Serializing with retrieval prevents an in-flight answer from citing a deleted source.
        with inference_slot(require_enabled=False), transaction.atomic():
            source = get_object_or_404(Source, tenant=acting_tenant(request), pk=source_id)
            record(
                action="coach.source.deleted",
                actor=request.user,
                tenant=request.tenant,
                target=source,
            )
            source.delete()
        return private(Response(status=204))


class AskView(PrivateView):
    throttle_classes = [TutorThrottle]

    @extend_schema(request=QuestionSerializer, responses=AnswerSerializer)
    def post(self, request):
        body = QuestionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        course = get_object_or_404(permitted_courses(request), pk=data["courseId"])
        with inference_slot():
            provider = Ollama()
            provider.verify_models()
            vector = provider.embed([data["question"]], query=True)[0]
            # Exact search filters permission, tenant and model version BEFORE ranking.
            chunks = list(
                Chunk.objects.filter(
                    tenant=acting_tenant(request),
                    source__tenant=request.tenant,
                    source__course=course,
                    source__agent=data["agent"],
                    source__embedding_digest=settings.COACH_EMBED_DIGEST,
                )
                .select_related("source")
                .annotate(distance=CosineDistance("embedding", vector))
                .order_by("distance", "id")[:5]
            )
            if not chunks:
                return private(
                    Response(
                        {
                            "answer": (
                                "No approved sources are available for this agent in this course."
                            ),
                            "citations": [],
                            "abstained": True,
                        }
                    )
                )
            while (
                chunks
                and len(
                    "".join(
                        Ollama.prompt(
                            data["question"],
                            [{"id": chunk.pk, "text": chunk.text} for chunk in chunks],
                            agent=data["agent"],
                        )
                    ).encode()
                )
                > 6500
            ):
                chunks.pop()
            if not chunks:
                return private(
                    Response(
                        {
                            "answer": "The source passages cannot fit safely with this question. "
                            "Try a shorter question.",
                            "citations": [],
                            "abstained": True,
                        }
                    )
                )
            result = provider.answer(
                data["question"],
                [{"id": chunk.pk, "text": chunk.text} for chunk in chunks],
                agent=data["agent"],
            )
            answer, cited, abstained = validate_answer(result, chunks)
            # Recheck publication/access before returning text after a slow model call.
            get_object_or_404(permitted_courses(request), pk=course.pk)
            citations = []
            for chunk in cited:
                label = chunk.source.title
                if chunk.source.edition:
                    label += f" [{chunk.source.edition}]"
                if chunk.page is not None:
                    label += f" (page {chunk.page})"
                citations.append(
                    {
                        "sourceId": str(chunk.source_id),
                        "chunkId": chunk.pk,
                        "label": label,
                        "courseId": str(course.pk),
                        "page": chunk.page,
                    }
                )
        return private(Response({"answer": answer, "citations": citations, "abstained": abstained}))


def validate_answer(result, chunks: list[Chunk]) -> tuple[str, list[Chunk], bool]:
    if not isinstance(result, dict):
        fail("answer is not an object")
    answer, ids, abstained = (
        result.get("answer"),
        result.get("citations"),
        result.get("abstained"),
    )
    if (
        not isinstance(answer, str)
        or not answer.strip()
        or len(answer) > 1600
        or not isinstance(ids, list)
        or len(ids) > 5
        or any(type(value) is not int for value in ids)
        or type(abstained) is not bool
    ):
        fail("invalid answer fields")
    allowed = {chunk.pk: chunk for chunk in chunks}
    if any(value not in allowed for value in ids) or len(set(ids)) != len(ids):
        fail("invalid citation")
    if abstained:
        if ids:
            fail("abstention includes citations")
        return "The approved course sources do not contain enough information to answer.", [], True
    if not ids:
        fail("answer lacks citations")
    return answer, [allowed[value] for value in ids], False
