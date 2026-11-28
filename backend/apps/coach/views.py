import hashlib
import hmac
import json
import logging
from dataclasses import dataclass
from datetime import timedelta

from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from pgvector.django import CosineDistance
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import TENANT_STAFF, HasTenantRole, IsActiveMember
from apps.audit.models import record
from apps.learning.access import Conflict, acting_tenant, visible_courses
from apps.learning.models import Module, PublishStatus
from apps.tenants import rls

from . import diagrams, guardrails
from . import provider as slot
from .documents import content_hash, pages_from_input, split_pages
from .models import Chunk, Exchange, Source
from .profiles import catalog
from .provider import PROMPT_BYTES, Ollama, Unavailable, fail, inference_slot
from .serializers import (
    AgentProfileSerializer,
    AnswerSerializer,
    CoachCourseSerializer,
    IngestResultSerializer,
    IngestSerializer,
    QuestionSerializer,
    RatingSerializer,
    ReviewItemSerializer,
    ReviewQueueSerializer,
    ReviewUpdateSerializer,
    SourceSerializer,
)

logger = logging.getLogger(__name__)


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
                        "moduleId": str(source.module_id) if source.module_id else None,
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
        module = module_of(course, data.get("moduleId"))
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
                and old.module_id == (module.pk if module else None)
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
                                "module": module,
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


def module_of(course, module_id):
    """The course's module with this id, or None when no id was given."""
    if not module_id:
        return None
    return get_object_or_404(Module, course=course, pk=module_id)


def pseudonym(member, tenant) -> str:
    """A stable stand-in for a member in the coach log: the same person, never a name."""
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"coach:{tenant.pk}:{member.pk}".encode(), hashlib.sha256).hexdigest()[:32]


@dataclass
class Asking:
    """A question that passed the checks and holds the inference slot."""

    tenant: object
    course: object
    module: object
    agent: str
    question: str
    chunks: list
    token: object

    @property
    def passages(self) -> list[dict]:
        return [{"id": chunk.pk, "text": chunk.text} for chunk in self.chunks]


def log(request, *, course, module, agent, question, payload, blocked="") -> dict:
    """Record the exchange and return the payload with its id."""
    exchange = Exchange.objects.create(
        tenant=acting_tenant(request),
        course=course,
        module=module,
        agent=agent,
        learner=pseudonym(request.user, acting_tenant(request)),
        question=question,
        answer=payload["answer"],
        abstained=payload["abstained"],
        blocked=blocked,
        citations=[{"label": c["label"]} for c in payload["citations"]],
        diagram=payload["diagram"],
    )
    return {"exchangeId": str(exchange.pk), **payload}


def without_model(answer: str) -> dict:
    return {"answer": answer, "abstained": True, "citations": [], "diagram": None, "followUps": []}


def begin(request, data) -> Asking | dict:
    """Check, retrieve and take the inference slot; or the finished payload when no
    model call is needed (refused by a guardrail, or nothing to answer from)."""
    if not settings.COACH_ENABLED:
        raise Unavailable("The local tutor has not been enabled on this server.")
    course = get_object_or_404(permitted_courses(request), pk=data["courseId"])
    module = module_of(course, data.get("moduleId"))
    agent = data["agent"]
    # The model and the log only ever see the redacted question.
    question = guardrails.redact(data["question"])
    kept = {"course": course, "module": module, "agent": agent, "question": question}
    reason = guardrails.blocked_reason(question)
    if reason:
        return log(
            request, payload=without_model(guardrails.MESSAGES[reason]), blocked=reason, **kept
        )
    token = slot.acquire()
    try:
        provider = Ollama()
        provider.verify_models()
        vector = provider.embed([question], query=True)[0]
        scope = Q(source__module__isnull=True)
        if module:
            scope |= Q(source__module=module)
        # Exact search filters permission, tenant and model version BEFORE ranking.
        chunks = list(
            Chunk.objects.filter(
                scope,
                tenant=acting_tenant(request),
                source__tenant=request.tenant,
                source__course=course,
                source__agent=agent,
                source__embedding_digest=settings.COACH_EMBED_DIGEST,
            )
            .select_related("source")
            .annotate(distance=CosineDistance("embedding", vector))
            .order_by("distance", "id")[:5]
        )
        asking = Asking(acting_tenant(request), course, module, agent, question, chunks, token)
        if not chunks:
            slot.release(token)
            return log(
                request,
                payload=without_model(
                    "No approved sources are available for this agent in this course."
                ),
                **kept,
            )
        while (
            asking.chunks
            and len("".join(Ollama.prompt(question, asking.passages, agent=agent)).encode())
            > PROMPT_BYTES
        ):
            asking.chunks.pop()
        if not asking.chunks:
            slot.release(token)
            return log(
                request,
                payload=without_model(
                    "The source passages cannot fit safely with this question. "
                    "Try a shorter question."
                ),
                **kept,
            )
        return asking
    except BaseException:
        slot.release(token)
        raise


def finish(request, asking: Asking, result) -> dict:
    """Validate what the model wrote and build the response. The slot stays held."""
    answer, cited, abstained = validate_answer(result, asking.chunks)
    # Recheck publication/access before returning text after a slow model call.
    get_object_or_404(permitted_courses(request), pk=asking.course.pk)
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
                "courseId": str(asking.course.pk),
                "page": chunk.page,
            }
        )
    payload = {
        "answer": answer,
        "abstained": abstained,
        "citations": citations,
        # Extras only accompany a sourced answer; a bad one is dropped, not an error.
        "diagram": None if abstained else diagrams.build(result.get("diagram")),
        "followUps": []
        if abstained
        else diagrams.follow_ups(result.get("followUps"), asking.question),
    }
    return log(
        request,
        course=asking.course,
        module=asking.module,
        agent=asking.agent,
        question=asking.question,
        payload=payload,
    )


class AskView(PrivateView):
    throttle_classes = [TutorThrottle]

    @extend_schema(request=QuestionSerializer, responses=AnswerSerializer)
    def post(self, request):
        body = QuestionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        asking = begin(request, body.validated_data)
        if isinstance(asking, dict):
            return private(Response(asking))
        try:
            result = Ollama().answer(asking.question, asking.passages, agent=asking.agent)
            return private(Response(finish(request, asking, result)))
        finally:
            slot.release(asking.token)


class EventStreamRenderer(BaseRenderer):
    """Lets `Accept: text/event-stream` through content negotiation; errors stay JSON."""

    media_type = "text/event-stream"
    format = "event-stream"
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return json.dumps(data).encode()


def sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


_END = object()


class AskStreamView(PrivateView):
    """The same answer as `ask`, as server-sent events: the text appears as it is written.

    Events: `status` {stage}, `delta` {text}, then `done` {the full answer} or `error`
    {detail, status}. Streamed text is provisional; `done` carries the validated answer
    and the client replaces what it showed. Refusals before generation (permission,
    throttle, tutor off or busy) are ordinary JSON errors, not a stream.
    """

    throttle_classes = [TutorThrottle]
    renderer_classes = [JSONRenderer, EventStreamRenderer]

    @extend_schema(request=QuestionSerializer, responses={(200, "text/event-stream"): str})
    def post(self, request):
        body = QuestionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        asking = begin(request, body.validated_data)
        response = StreamingHttpResponse(
            self.events(request, asking), content_type="text/event-stream"
        )
        response["X-Accel-Buffering"] = "no"
        return response

    @staticmethod
    async def events(request, asking):
        if isinstance(asking, dict):
            yield sse("done", asking)
            return
        # Everything that touches the database or blocks runs on the request's own
        # thread, so it uses the connection that holds the inference slot.
        stream = Ollama().answer_stream(asking.question, asking.passages, agent=asking.agent)

        def complete(result):
            # The request's tenant scope ended when the view returned; restore it.
            rls.set_tenant(asking.tenant.pk)
            try:
                return finish(request, asking, result)
            finally:
                rls.set_tenant(None)

        def close():
            stream.close()
            slot.release(asking.token)

        try:
            yield sse("status", {"stage": "generating"})
            result = None
            while True:
                item = await sync_to_async(next)(stream, _END)
                if item is _END:
                    break
                kind, value = item
                if kind == "delta":
                    yield sse("delta", {"text": value})
                else:
                    result = value
            yield sse("done", await sync_to_async(complete)(result))
        except APIException as error:
            yield sse("error", {"detail": str(error.detail), "status": error.status_code})
        except Exception:
            # Never log questions, course text or responses.
            logger.exception("Coach stream failed")
            yield sse("error", {"detail": Unavailable.default_detail, "status": 503})
        finally:
            await sync_to_async(close)()


class RatingView(PrivateView):
    """Thumbs up or down on an answer you were given. Only the asker can rate it."""

    @extend_schema(request=RatingSerializer, responses={204: None})
    def post(self, request, exchange_id):
        body = RatingSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        tenant = acting_tenant(request)
        exchange = get_object_or_404(
            Exchange, tenant=tenant, pk=exchange_id, learner=pseudonym(request.user, tenant)
        )
        exchange.rating = body.validated_data["rating"] or ""
        exchange.rating_note = (
            guardrails.redact(body.validated_data["note"]) if exchange.rating == "down" else ""
        )
        exchange.save(update_fields=["rating", "rating_note"])
        return private(Response(status=204))


NEEDS_REVIEW = Q(rating=Exchange.Rating.DOWN) | Q(abstained=True) | ~Q(blocked="")


def review_item(exchange: Exchange) -> dict:
    if exchange.blocked:
        reason = "blocked"
    elif exchange.rating == Exchange.Rating.DOWN:
        reason = "thumbs_down"
    else:
        reason = "abstained"
    return {
        "id": str(exchange.pk),
        "createdAt": exchange.created_at.isoformat(),
        "courseId": str(exchange.course_id),
        "courseTitle": exchange.course.title,
        "moduleId": str(exchange.module_id) if exchange.module_id else None,
        "agent": exchange.agent,
        "learner": f"Learner {exchange.learner[:4]}",
        "question": exchange.question,
        "answer": exchange.answer,
        "abstained": exchange.abstained,
        "blocked": bool(exchange.blocked),
        "rating": exchange.rating or None,
        "ratingNote": exchange.rating_note,
        "citations": exchange.citations,
        "reason": reason,
        "status": exchange.review_status,
        "reviewNote": exchange.review_note,
        "diagram": exchange.diagram,
    }


def reviewable(request):
    return Exchange.objects.filter(
        tenant=acting_tenant(request), course__in=visible_courses(request)
    ).select_related("course")


class ReviewQueueView(StaffView):
    """Staff: what the coach was asked this week and which answers need a look.

    The queue holds thumbs-down answers, abstentions and guardrail refusals. Learners
    appear under a pseudonym only.
    """

    @extend_schema(responses=ReviewQueueSerializer)
    def get(self, request):
        try:
            days = min(90, max(1, int(request.query_params.get("days", 7))))
        except ValueError:
            days = 7
        status = request.query_params.get("status", "open")
        recent = reviewable(request).filter(created_at__gte=timezone.now() - timedelta(days=days))
        counts = recent.aggregate(
            asked=Count("id"),
            helpful=Count("id", filter=Q(rating=Exchange.Rating.UP)),
            unhelpful=Count("id", filter=Q(rating=Exchange.Rating.DOWN)),
            abstained=Count("id", filter=Q(abstained=True)),
        )
        rated = counts["helpful"] + counts["unhelpful"]
        queue = recent.filter(NEEDS_REVIEW)
        if status in Exchange.ReviewStatus.values:
            queue = queue.filter(review_status=status)
        return private(
            Response(
                {
                    "summary": {
                        "days": days,
                        **counts,
                        "helpfulRate": round(counts["helpful"] / rated, 3) if rated else None,
                    },
                    "items": [review_item(exchange) for exchange in queue[:200]],
                }
            )
        )


class ReviewItemView(StaffView):
    @extend_schema(request=ReviewUpdateSerializer, responses=ReviewItemSerializer)
    def post(self, request, exchange_id):
        body = ReviewUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        exchange = get_object_or_404(reviewable(request), pk=exchange_id)
        exchange.review_status = body.validated_data["status"]
        exchange.review_note = body.validated_data["note"]
        reviewed = exchange.review_status == Exchange.ReviewStatus.REVIEWED
        exchange.reviewed_by = request.user if reviewed else None
        exchange.reviewed_at = timezone.now() if reviewed else None
        exchange.save(update_fields=["review_status", "review_note", "reviewed_by", "reviewed_at"])
        return private(Response(review_item(exchange)))


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
