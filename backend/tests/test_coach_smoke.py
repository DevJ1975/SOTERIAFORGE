"""Opt-in real Ollama + Postgres + authenticated API check, using synthetic data only."""

import io
import os
import uuid

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from apps.accounts.models import Role
from apps.coach.models import Chunk
from apps.learning.models import Course, Enrollment
from conftest import client_for, make_member, sign_in

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.skipif(
        os.environ.get("COACH_SMOKE") != "1", reason="Requires native Ollama models"
    ),
]


def test_real_local_pdf_retrieval_and_cited_tutor(lakewood, settings):
    settings.COACH_ENABLED = True
    cache.clear()
    make_member(lakewood, "smoke-teacher", Role.INSTRUCTOR)
    learner = make_member(lakewood, "smoke-learner")
    course = Course.objects.create(tenant=lakewood, title="Synthetic gardening", status="published")
    Enrollment.objects.create(tenant=lakewood, member=learner, course=course)
    teacher = client_for(sign_in("smoke-teacher", "lakewood-pool"))
    student = client_for(sign_in("smoke-learner", "lakewood-pool"))

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )
    stream = DecodedStreamObject()
    stream.set_data(
        b"BT /F1 12 Tf 50 700 Td "
        b"(In this synthetic course, basil needs six hours of sunlight.) Tj ET"
    )
    page[NameObject("/Contents")] = stream
    output = io.BytesIO()
    writer.write(output)

    source_id = uuid.uuid4()
    response = teacher.put(
        f"/api/coach/sources/{source_id}",
        {
            "courseId": str(course.pk),
            "label": "Synthetic basil handout",
            "file": SimpleUploadedFile("basil.pdf", output.getvalue()),
            "approved": "true",
        },
        format="multipart",
    )
    assert response.status_code == 200, response.json()
    assert Chunk.objects.get().page == 1
    response = student.post(
        "/api/coach/ask",
        {"courseId": str(course.pk), "question": "How much sunlight does basil need?"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert not data["abstained"], data
    assert "six" in data["answer"].lower() or "6" in data["answer"], data
    assert data["citations"] == [
        {
            "sourceId": str(source_id),
            "chunkId": Chunk.objects.get().pk,
            "label": "Synthetic basil handout (page 1)",
            "courseId": str(course.pk),
            "page": 1,
        }
    ]
    response = student.post(
        "/api/coach/ask",
        {"courseId": str(course.pk), "question": "What is the tuition fee for this course?"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["abstained"] is True, response.json()
    assert response.json()["citations"] == []


@pytest.mark.parametrize(
    ("agent", "text", "question", "expected"),
    [
        (
            "workplace-ai",
            "In this fictional team's AI workflow, every AI-written customer email "
            "must receive human review before sending.",
            "In this team's workflow, what must happen before an AI-written email is sent?",
            "review",
        ),
        (
            "cybersecurity-ai",
            "In this fictional defensive training lab, analysts must redact access tokens "
            "before submitting synthetic log excerpts to the AI assistant.",
            "In this training lab, what must analysts do to access tokens before submitting logs?",
            "redact",
        ),
    ],
)
def test_real_local_specialist_grounding(lakewood, settings, agent, text, question, expected):
    settings.COACH_ENABLED = True
    cache.clear()
    make_member(lakewood, "specialist-teacher", Role.INSTRUCTOR)
    learner = make_member(lakewood, "specialist-learner")
    course = Course.objects.create(
        tenant=lakewood, title="Synthetic specialist lab", status="published"
    )
    Enrollment.objects.create(tenant=lakewood, member=learner, course=course)
    teacher = client_for(sign_in("specialist-teacher", "lakewood-pool"))
    student = client_for(sign_in("specialist-learner", "lakewood-pool"))
    source_id = uuid.uuid4()
    response = teacher.put(
        f"/api/coach/sources/{source_id}",
        {
            "courseId": str(course.pk),
            "agent": agent,
            "text": text,
            "label": "Synthetic evaluation only",
            "approved": True,
            "referenceUrl": "https://example.invalid/synthetic-specialist-evaluation",
            "edition": "Synthetic test v1",
        },
        format="json",
    )
    assert response.status_code == 200, response.json()
    response = student.post(
        "/api/coach/ask",
        {"courseId": str(course.pk), "agent": agent, "question": question},
        format="json",
    )
    assert response.status_code == 200, response.json()
    answer = response.json()
    assert not answer["abstained"], answer
    assert expected in answer["answer"].lower(), answer
    assert answer["citations"][0]["sourceId"] == str(source_id), answer
    assert "[Synthetic test v1]" in answer["citations"][0]["label"], answer
    other_agent = "cybersecurity-ai" if agent == "workplace-ai" else "workplace-ai"
    response = student.post(
        "/api/coach/ask",
        {"courseId": str(course.pk), "agent": other_agent, "question": question},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["abstained"] is True, response.json()
    assert response.json()["citations"] == []
