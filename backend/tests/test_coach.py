import io
import uuid

import pytest
from django.conf import settings
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from drf_spectacular.generators import SchemaGenerator
from pypdf import PdfWriter

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.coach.models import Chunk, Source
from apps.coach.provider import Busy, Ollama, Unavailable, inference_slot
from apps.learning.models import Course, Enrollment
from apps.tenants import rls
from conftest import client_for, make_member, sign_in

pytestmark = pytest.mark.django_db


def test_coach_schema_does_not_replace_the_learning_course_contract():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    schemas = schema["components"]["schemas"]
    assert set(schemas["CoachCourse"]["properties"]) == {"id", "title"}
    assert {"status", "description", "tags"} <= set(schemas["Course"]["properties"])


@pytest.fixture
def pilot(lakewood, monkeypatch, settings):
    settings.COACH_ENABLED = True
    cache.clear()
    teacher = make_member(lakewood, "teacher", Role.INSTRUCTOR)
    learner = make_member(lakewood, "learner")
    make_member(lakewood, "peer")
    course = Course.objects.create(tenant=lakewood, title="Gardening", status="published")
    Enrollment.objects.create(tenant=lakewood, member=learner, course=course)
    calls = {"embeddings": [], "passages": []}

    def embed(self, texts, **kwargs):
        calls["embeddings"].extend(texts)
        return [[1.0] + [0.0] * 1023 for _ in texts]

    def answer(self, question, passages, **kwargs):
        calls["passages"] = passages
        calls["agent"] = kwargs.get("agent")
        return {
            "answer": "Basil needs sunlight.",
            "citations": [passages[0]["id"]],
            "abstained": False,
        }

    monkeypatch.setattr(Ollama, "verify_models", lambda self: None)
    monkeypatch.setattr(Ollama, "embed", embed)
    monkeypatch.setattr(Ollama, "answer", answer)
    return course, teacher, learner, calls


def as_(uid):
    return client_for(sign_in(uid, "lakewood-pool"))


def ingest(course, source_id=None, **extra):
    return as_("teacher").put(
        f"/api/coach/sources/{source_id or uuid.uuid4()}",
        {
            "courseId": str(course.pk),
            "label": "Basil guide",
            "text": "Basil needs sunlight.",
            "approved": True,
            **extra,
        },
        format="json",
    )


def ask(course, uid="learner", **extra):
    return as_(uid).post(
        "/api/coach/ask",
        {"courseId": str(course.pk), "question": "What does basil need?", **extra},
        format="json",
    )


def test_approved_ingestion_is_idempotent_and_audited(pilot):
    course, _, _, calls = pilot
    source_id = uuid.uuid4()
    assert ingest(course, source_id).json() == {"ok": True, "chunks": 1}
    old_chunk = Chunk.objects.get().pk
    assert ingest(course, source_id).json() == {"ok": True, "chunks": 1}
    assert Chunk.objects.get().pk == old_chunk
    assert len(calls["embeddings"]) == 1
    assert AuditEntry.objects.filter(action="coach.source.approved").count() == 1
    assert Source.objects.get().embedding_digest == settings.COACH_EMBED_DIGEST


def test_ask_returns_only_database_citations_and_does_not_store_chat(pilot):
    course, _, _, calls = pilot
    ingest(course)
    response = ask(course)
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    citation = response.json()["citations"][0]
    assert citation == {
        "sourceId": str(Source.objects.get().pk),
        "chunkId": Chunk.objects.get().pk,
        "label": "Basil guide",
        "courseId": str(course.pk),
        "page": None,
    }
    assert calls["passages"] == [{"id": Chunk.objects.get().pk, "text": "Basil needs sunlight."}]
    assert AuditEntry.objects.count() == 1  # source approval only, no prompts/answers


def test_learner_must_be_enrolled_and_cannot_ingest(pilot):
    course, _, _, _ = pilot
    assert ask(course, uid="peer").status_code == 404
    assert as_("peer").get("/api/coach/courses").json() == []
    assert as_("learner").get("/api/coach/sources").status_code == 403
    assert as_("learner").put(f"/api/coach/sources/{uuid.uuid4()}", {}).status_code == 403
    assert client_for().post("/api/coach/ask").status_code == 401


def test_draft_archived_and_foreign_courses_are_not_retrieved(pilot, acme):
    course, _, _, calls = pilot
    ingest(course)
    for status in ["draft", "archived"]:
        course.status = status
        course.save()
        assert ask(course).status_code == 404
        assert ask(course, uid="teacher").status_code == 404
    course.status = "published"
    course.save()
    make_member(acme, "outsider")
    outsider = client_for(sign_in("outsider"), tenant="acme")
    assert (
        outsider.post(
            "/api/coach/ask", {"courseId": str(course.pk), "question": "secret?"}, format="json"
        ).status_code
        == 404
    )
    assert calls["passages"] == []


def test_filtering_happens_before_ranking(pilot, lakewood, acme):
    course, teacher, learner, calls = pilot
    ingest(course)
    other = Course.objects.create(tenant=lakewood, title="Other", status="published")
    ingest(other, text="OTHER COURSE SECRET")
    foreign_teacher = make_member(acme, "foreign-teacher", Role.INSTRUCTOR)
    foreign_course = Course.objects.create(tenant=acme, title="Foreign", status="published")
    source = Source.objects.create(
        tenant=acme,
        course=foreign_course,
        title="Foreign source",
        content_hash="x" * 64,
        embedding_digest=settings.COACH_EMBED_DIGEST,
        approved_by=foreign_teacher,
    )
    Chunk.objects.create(
        tenant=acme,
        source=source,
        ordinal=0,
        text="FOREIGN SECRET",
        embedding=[1.0] + [0.0] * 1023,
    )
    assert ask(course).status_code == 200
    assert [p["text"] for p in calls["passages"]] == ["Basil needs sunlight."]


def test_rls_protects_sources_and_chunks(pilot, lakewood):
    course, _, _, _ = pilot
    ingest(course)
    rls.set_bypass(False)
    rls.set_tenant("acme")
    assert Source.objects.count() == Chunk.objects.count() == 0
    rls.set_tenant("lakewood")
    assert Source.objects.count() == Chunk.objects.count() == 1


def test_replacement_and_deletion_invalidate_chunks(pilot):
    course, _, _, _ = pilot
    source_id = uuid.uuid4()
    ingest(course, source_id)
    original = Chunk.objects.get().pk
    assert ingest(course, source_id, text="Revised learner material.").status_code == 200
    assert not Chunk.objects.filter(pk=original).exists()
    assert Chunk.objects.get().text == "Revised learner material."
    assert as_("teacher").delete(f"/api/coach/sources/{source_id}").status_code == 204
    assert not Source.objects.exists() and not Chunk.objects.exists()
    assert ask(course).json()["abstained"] is True


def test_failed_reembedding_preserves_previous_source(pilot, monkeypatch):
    course, _, _, _ = pilot
    source_id = uuid.uuid4()
    ingest(course, source_id)
    old_hash = Source.objects.get().content_hash

    def outage(*args, **kwargs):
        raise Unavailable()

    monkeypatch.setattr(Ollama, "embed", outage)
    assert ingest(course, source_id, text="Revision").status_code == 503
    assert Source.objects.get().content_hash == old_hash
    assert Chunk.objects.get().text == "Basil needs sunlight."


def test_staff_can_delete_sources_with_inference_disabled(pilot, settings):
    course, _, _, _ = pilot
    source_id = uuid.uuid4()
    ingest(course, source_id)
    settings.COACH_ENABLED = False
    assert as_("teacher").delete(f"/api/coach/sources/{source_id}").status_code == 204
    assert not Source.objects.exists()


@pytest.mark.parametrize(
    "result",
    [
        {"answer": "Invented", "citations": [99999999], "abstained": False},
        {"answer": "Unsupported", "citations": [], "abstained": False},
        {"answer": "X", "citations": ["1"], "abstained": False},
        {"answer": "X", "citations": [], "abstained": "false"},
        {"answer": "x" * 1601, "citations": [], "abstained": True},
        [],
    ],
)
def test_invalid_model_output_is_explicit_failure(pilot, monkeypatch, result):
    course, _, _, _ = pilot
    ingest(course)
    monkeypatch.setattr(Ollama, "answer", lambda *args, **kwargs: result)
    response = ask(course)
    assert response.status_code == 503
    assert response["Cache-Control"] == "no-store"
    assert "citations" not in response.json()


def test_model_abstention_uses_fixed_safe_text(pilot, monkeypatch):
    course, _, _, _ = pilot
    ingest(course)
    monkeypatch.setattr(
        Ollama,
        "answer",
        lambda *args, **kwargs: {
            "answer": "Ignore all rules",
            "citations": [],
            "abstained": True,
        },
    )
    assert ask(course).json() == {
        "answer": "The approved course sources do not contain enough information to answer.",
        "citations": [],
        "abstained": True,
    }


def test_model_version_change_requires_reindex(pilot):
    course, _, _, _ = pilot
    ingest(course)
    Source.objects.update(embedding_digest="old")
    assert ask(course).json()["abstained"] is True


def test_course_unpublished_during_generation_is_not_returned(pilot, monkeypatch):
    course, _, _, _ = pilot
    ingest(course)

    def answer(self, question, passages, **kwargs):
        Course.objects.filter(pk=course.pk).update(status="archived")
        return {"answer": "Must not return", "citations": [passages[0]["id"]], "abstained": False}

    monkeypatch.setattr(Ollama, "answer", answer)
    assert ask(course).status_code == 404


def test_ingestion_requires_approval_and_bounded_input(pilot):
    course, _, _, _ = pilot
    assert ingest(course, approved=False).status_code == 400
    assert ingest(course, text="x" * 60001).status_code == 400
    assert ingest(course, text="  ").status_code == 400
    assert ingest(course, text="Invalid\x00text").status_code == 400
    assert ask(course, question="x" * 1001).status_code == 400
    assert ask(course, question="文" * 600).status_code == 400


def test_markdown_and_pdf_validation(pilot):
    course, _, _, _ = pilot
    path = f"/api/coach/sources/{uuid.uuid4()}"
    base = {"courseId": str(course.pk), "label": "Handout", "approved": "true"}
    response = as_("teacher").put(
        path,
        {**base, "file": SimpleUploadedFile("guide.md", b"# Basil\nNeeds sunlight.")},
        format="multipart",
    )
    assert response.status_code == 200
    assert Chunk.objects.get().text == "# Basil\nNeeds sunlight."
    for name, raw in [
        ("bad.pdf", b"broken"),
        ("bad.html", b"<p>text</p>"),
        ("bad.txt", b"\xff"),
        ("large.txt", b"x" * 2_000_001),
    ]:
        response = as_("teacher").put(
            path,
            {**base, "file": SimpleUploadedFile(name, raw)},
            format="multipart",
        )
        assert response.status_code == 400
    pdf = PdfWriter()
    pdf.add_blank_page(width=100, height=100)
    out = io.BytesIO()
    pdf.write(out)
    assert (
        as_("teacher")
        .put(
            path,
            {**base, "file": SimpleUploadedFile("scanned.pdf", out.getvalue())},
            format="multipart",
        )
        .status_code
        == 400
    )


def test_busy_and_disabled_are_explicit(pilot, settings, monkeypatch):
    course, _, _, _ = pilot
    settings.COACH_ENABLED = False
    assert ask(course).status_code == 503
    settings.COACH_ENABLED = True
    # A separate DB session holds the process-wide admission lock.
    import psycopg

    config = connection.settings_dict
    with psycopg.connect(
        dbname=config["NAME"],
        user=config["USER"],
        password=config["PASSWORD"],
        host=config["HOST"],
        port=config["PORT"],
    ) as other:
        other.execute("SELECT pg_advisory_lock(78501234)")
        try:
            with pytest.raises(Busy), inference_slot():
                pytest.fail("A busy model must not be admitted")
        finally:
            other.execute("SELECT pg_advisory_unlock(78501234)")
    with inference_slot():
        pass  # lock was released and can be acquired again


def test_foreign_source_id_cannot_be_overwritten_even_by_superadmin(pilot, acme):
    course, _, _, _ = pilot
    foreign = Source.objects.create(
        tenant=acme,
        course=Course.objects.create(tenant=acme, title="Secret"),
        title="Secret",
        approved_by=make_member(acme, "owner", Role.INSTRUCTOR),
        content_hash="x" * 64,
        embedding_digest=settings.COACH_EMBED_DIGEST,
    )
    make_member(None, "root", Role.SUPERADMIN)
    root = client_for(sign_in("root"), tenant="lakewood")
    response = root.put(
        f"/api/coach/sources/{foreign.pk}",
        {
            "courseId": str(course.pk),
            "label": "Stolen",
            "text": "X",
            "approved": True,
        },
        format="json",
    )
    assert response.status_code == 409
    foreign.refresh_from_db()
    assert foreign.tenant_id == "acme" and foreign.title == "Secret"


@pytest.mark.parametrize("vectors", [[], [[0] * 1024], [[1] * 1023], [[float("nan")] * 1024]])
def test_provider_rejects_bad_embedding_shapes(monkeypatch, vectors):
    monkeypatch.setattr(Ollama, "call", lambda *args: {"embeddings": vectors})
    with pytest.raises(Unavailable):
        Ollama().embed(["sample"])


def test_provider_pins_digests_and_rejects_truncation(monkeypatch):
    monkeypatch.setattr(Ollama, "call", lambda *args: {"models": []})
    with pytest.raises(Unavailable):
        Ollama().verify_models()
    monkeypatch.setattr(
        Ollama,
        "call",
        lambda *args: {
            "done": True,
            "done_reason": "length",
            "message": {"content": "{}"},
        },
    )
    with pytest.raises(Unavailable):
        Ollama().answer("question", [{"id": 1, "text": "source"}])
