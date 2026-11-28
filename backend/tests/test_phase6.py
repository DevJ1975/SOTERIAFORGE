"""Platform Phase 6: more xAPI events, LMS export packages, analytics and the at-risk list."""

import io
import json
import os
import shutil
import subprocess
import zipfile
from datetime import timedelta
from pathlib import Path

import pytest
from defusedxml.ElementTree import fromstring
from django.utils import timezone

from apps.accounts.models import Role
from apps.assessments.models import CheckAnswer
from apps.engage.models import Attendance, Classroom, Session
from apps.gamification.models import ActivityDay, Cohort, Crew, CrewMembership, Section
from apps.learning.models import Enrollment, LessonProgress
from apps.learning.progress import complete_lesson
from apps.reports import analytics
from apps.standards.models import Dispatch, Statement
from apps.standards.packages import inspect_zip
from conftest import client_for, make_member, sign_in
from tests.content import FAILING, PASSING, build_course

pytestmark = pytest.mark.django_db
LMS = "https://lms.lakewood.example"


@pytest.fixture
def setup(lakewood, settings):
    settings.XAPI_RECORDING_ENABLED = True
    settings.AUTH_LINK_BASE_URL = "https://learn.example.test"
    teacher = make_member(lakewood, "teacher", Role.INSTRUCTOR)
    learner = make_member(lakewood, "learner", display_name="Lee Learner")
    content = build_course(lakewood, teacher)
    content.teacher = teacher
    content.learner = learner
    content.enrollment = Enrollment.objects.create(
        tenant=lakewood, course=content.course, member=learner
    )
    return content


def as_(uid):
    return client_for(sign_in(uid))


def verbs():
    return sorted(
        (row.event_key.split(":")[0], row.payload["verb"]["id"].rsplit("/", 1)[-1])
        for row in Statement.objects.all()
    )


# --- xAPI outbox -------------------------------------------------------------------


def test_quiz_attempts_and_course_completion_reach_the_outbox(setup):
    url = f"/api/lessons/{setup.exam.pk}/attempts"
    assert as_("learner").post(url, {"responses": FAILING}, format="json").status_code == 200
    assert verbs() == [("quiz-attempt", "failed")]
    failed = Statement.objects.get().payload
    assert failed["result"]["success"] is False and failed["result"]["score"]["raw"] == 0
    assert failed["actor"]["account"]["name"] == str(setup.learner.pk)
    assert "learner@example.com" not in str(failed) and "Lee" not in str(failed)
    assert failed["context"]["contextActivities"]["parent"][0]["id"].endswith(
        f"/lessons/{setup.exam.pk}"
    )

    assert as_("learner").post(url, {"responses": PASSING}, format="json").status_code == 200
    assert verbs() == [
        ("lesson-completed", "completed"),
        ("quiz-attempt", "failed"),
        ("quiz-attempt", "passed"),
    ]
    complete_lesson(setup.enrollment, setup.video)
    complete_lesson(setup.enrollment, setup.checked)
    complete_lesson(setup.enrollment, setup.checked)  # a repeat queues nothing more
    assert verbs().count(("course-completed", "completed")) == 1
    course = Statement.objects.get(event_key__startswith="course-completed").payload
    assert course["object"]["id"].endswith(f"/courses/{setup.course.pk}")
    assert Statement.objects.count() == 6


def test_nothing_is_queued_while_recording_is_off(setup, settings):
    settings.XAPI_RECORDING_ENABLED = False
    url = f"/api/lessons/{setup.exam.pk}/attempts"
    assert as_("learner").post(url, {"responses": PASSING}, format="json").status_code == 200
    assert Statement.objects.count() == 0


# --- LMS export packages -----------------------------------------------------------


def create(format="scorm12", origins=(LMS,), uid="teacher", course=None, **extra):
    return as_(uid).post(
        "/api/standards/dispatches",
        {"courseId": str(course), "format": format, "lmsOrigins": list(origins), **extra},
        format="json",
    )


def test_scorm_export_is_a_valid_single_sco_package_that_opens_the_course(setup):
    response = create(course=setup.course.pk, origins=[LMS + "/", LMS])
    assert response.status_code == 201, response.data
    data = response.data
    assert data["lmsOrigins"] == [LMS] and data["revoked"] is False
    assert data["launchUrl"] == f"https://learn.example.test/dispatch/{data['id']}"

    package = as_("teacher").get(f"/api/standards/dispatches/{data['id']}/package")
    assert package.status_code == 200 and package["Content-Type"] == "application/zip"
    assert package["Content-Disposition"] == 'attachment; filename="ai-cyber-defender-scorm12.zip"'
    # Our own importer accepts it as SCORM 1.2 with one SCO.
    metadata, files = inspect_zip(package.content)
    assert (metadata["version"], metadata["launch"]) == ("1.2", "index.html")
    assert metadata["title"] == "AI Cyber Defender"
    launcher = dict(files)["index.html"].decode()
    assert f'"launchUrl": "{data["launchUrl"]}"' in launcher
    assert '"appOrigin": "https://learn.example.test"' in launcher
    assert "LMSInitialize" in launcher and "cmi.core.lesson_status" in launcher
    assert as_("teacher").get("/api/standards/dispatches").data[0]["id"] == data["id"]


def test_course_titles_cannot_break_out_of_the_package_markup(setup):
    setup.course.title = 'Safety </script><script>alert(1)</script> & "more"'
    setup.course.save()
    for format in ("scorm12", "cmi5"):
        dispatch = create(format=format, course=setup.course.pk).data
        raw = as_("teacher").get(f"/api/standards/dispatches/{dispatch['id']}/package").content
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for name in archive.namelist():
                body = archive.read(name).decode()
                assert "<script>alert(1)" not in body
                if name.endswith(".xml"):
                    fromstring(body)  # still well-formed


def test_cmi5_export_names_the_learner_app_as_the_assignable_unit(setup):
    response = create(format="cmi5", origins=[], course=setup.course.pk)
    assert response.status_code == 201, response.data
    raw = as_("teacher").get(f"/api/standards/dispatches/{response.data['id']}/package").content
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        assert archive.namelist() == ["cmi5.xml"]
        root = fromstring(archive.read("cmi5.xml"))
    ns = "{https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd}"
    unit = root.find(f"{ns}au")
    assert unit.get("moveOn") == "Completed" and unit.get("launchMethod") == "OwnWindow"
    assert unit.find(f"{ns}url").text == response.data["launchUrl"]
    assert root.find(f"{ns}course").get("id").endswith(f"/courses/{setup.course.pk}")


def test_export_rules(setup, lakewood, acme):
    course = setup.course.pk
    assert create(uid="learner", course=course).status_code == 403
    assert create(origins=[], course=course).status_code == 400
    for bad in ("http://lms.example.org", "https://lms.example.org/path", "lms.example.org"):
        assert create(origins=[bad], course=course).status_code == 400, bad
    many = [f"https://l{n}.example.org" for n in range(11)]
    assert create(origins=many, course=course).status_code == 400
    assert Dispatch.objects.count() == 0
    setup.course.status = "draft"
    setup.course.save()
    assert create(course=course).status_code == 400
    # Another tenant's course is not exportable from here.
    setup.course.status = "published"
    setup.course.save()
    make_member(acme, "outsider", Role.TENANT_ADMIN)
    assert create(uid="outsider", course=course).status_code == 400


def test_the_learner_session_reports_progress_and_stops_when_revoked(setup, acme):
    dispatch = create(course=setup.course.pk).data
    url = f"/api/standards/dispatches/{dispatch['id']}/session"
    make_member(setup.course.tenant, "visitor")
    assert as_("visitor").get(url).data["enrolled"] is False

    first = as_("learner").get(url)
    assert first.status_code == 200 and first["Cache-Control"] == "no-store"
    assert first.json() == {
        "dispatchId": dispatch["id"],
        "courseId": str(setup.course.pk),
        "courseTitle": "AI Cyber Defender",
        "format": "scorm12",
        "lmsOrigins": [LMS],
        "enrolled": True,
        "progressPct": 0,
        "completed": False,
        "completedAt": None,
        "scorePct": None,
    }
    complete_lesson(setup.enrollment, setup.video)
    complete_lesson(setup.enrollment, setup.checked, score=70)
    complete_lesson(setup.enrollment, setup.exam, score=91)
    done = as_("learner").get(url).data
    assert (done["progressPct"], done["completed"], done["scorePct"]) == (100, True, 80)

    make_member(acme, "outsider")
    assert as_("outsider").get(url).status_code == 404
    patched = as_("teacher").patch(
        f"/api/standards/dispatches/{dispatch['id']}",
        {"revoked": True, "lmsOrigins": [LMS, "https://cdn.lakewood.example"]},
        format="json",
    )
    assert patched.data["revoked"] and len(patched.data["lmsOrigins"]) == 2
    assert as_("learner").get(url).status_code == 404
    assert (
        as_("teacher").get(f"/api/standards/dispatches/{dispatch['id']}/package").status_code == 404
    )


# --- Analytics and the at-risk list ------------------------------------------------


@pytest.fixture
def cohort(setup, lakewood):
    """Five learners in one cohort: four on pace and Sam, who has fallen away."""
    now = timezone.now()
    cohort = Cohort.objects.create(tenant=lakewood, name="Cohort 1")
    section = Section.objects.create(tenant=lakewood, cohort=cohort, name="A")
    crew = Crew.objects.create(tenant=lakewood, cohort=cohort, section=section, name="Falcons")
    members = {"learner": setup.learner}
    for uid in ("ana", "ben", "cy", "sam"):
        members[uid] = make_member(lakewood, uid, display_name=uid.title())
        Enrollment.objects.create(tenant=lakewood, course=setup.course, member=members[uid])
    for uid, member in members.items():
        CrewMembership.objects.create(tenant=lakewood, cohort=cohort, crew=crew, member=member)
        enrollment = Enrollment.objects.get(member=member)
        if uid == "sam":
            Enrollment.objects.filter(pk=enrollment.pk).update(
                created_at=now - timedelta(days=30),
                last_activity_at=now - timedelta(days=12),
                due_at=now - timedelta(days=1),
            )
            continue
        complete_lesson(enrollment, setup.video)
        complete_lesson(enrollment, setup.checked)
        ActivityDay.objects.get_or_create(tenant=lakewood, member=member, day=now.date())
    # First-try answers: Sam gets one of six right, Ana five of six.
    for uid, right in (("sam", 1), ("ana", 5)):
        enrollment = Enrollment.objects.get(member=members[uid])
        for n in range(6):
            CheckAnswer.objects.create(
                tenant=lakewood,
                enrollment=enrollment,
                lesson=setup.checked,
                quiz=setup.check,
                question_id=f"q{n}",
                first_response={},
                first_correct=n < right,
                first_answered_at=now,
            )
    # Three ended live sessions; Sam came to none, Ben missed one.
    room = Classroom.objects.create(
        tenant=lakewood, created_by=setup.teacher, title="Live", cohort=cohort
    )
    for n in range(3):
        session = Session.objects.create(
            tenant=lakewood,
            classroom=room,
            started_by=setup.teacher,
            status=Session.Status.ENDED,
            stage_started_at=now,
            ended_at=now - timedelta(days=n + 1),
        )
        for uid, member in members.items():
            if uid == "sam" or (uid == "ben" and n == 0):
                continue
            Attendance.objects.create(
                tenant=lakewood,
                session=session,
                member=member,
                first_joined_at=now,
                last_seen_at=now,
            )
    cohort.members = members
    return cohort


def test_analytics_totals_lessons_and_weeks(setup, cohort):
    assert as_("learner").get("/api/reports/analytics").status_code == 403
    data = as_("teacher").get(f"/api/reports/analytics?courseId={setup.course.pk}").data
    assert data["totals"] == {
        "learners": 5,
        "activeLast7Days": 4,
        "enrollments": 5,
        "completions": 0,
        "completionRate": 0.0,
        "averageProgressPct": 54,  # four at 67% and one at 0
        "firstTryPct": 50,
    }
    assert [(row["title"], row["enrollments"]) for row in data["courses"]] == [
        ("AI Cyber Defender", 5)
    ]
    lessons = {row["title"]: row for row in data["lessons"]}
    assert [row["completions"] for row in data["lessons"]] == [4, 4, 0]
    assert lessons["How prompt injection hijacks an AI assistant"]["firstTryPct"] == 50
    assert lessons["Why it works"]["firstTryPct"] is None
    assert len(data["weeks"]) == 8
    assert data["weeks"][-1]["activeLearners"] == 4 and data["weeks"][-1]["lessonsCompleted"] == 8
    assert sum(week["lessonsCompleted"] for week in data["weeks"][:-1]) == 0

    # Without a course there is no lesson table; an empty cohort has no one in it.
    assert as_("teacher").get("/api/reports/analytics").data["lessons"] == []
    other = Cohort.objects.create(tenant=setup.course.tenant, name="Cohort 2")
    empty = as_("teacher").get(f"/api/reports/analytics?cohortId={other.pk}").data
    assert empty["totals"]["learners"] == 0 and empty["totals"]["firstTryPct"] is None
    assert as_("teacher").get("/api/reports/analytics?cohortId=nope").status_code == 400


def test_at_risk_lists_only_flagged_learners_with_their_reasons(setup, cohort, acme):
    assert as_("learner").get("/api/reports/at-risk").status_code == 403
    response = as_("teacher").get(f"/api/reports/at-risk?cohortId={cohort.pk}")
    assert response.status_code == 200 and response["Cache-Control"] == "no-store"
    assert response.data["rules"] == analytics.RULES
    learners = response.data["learners"]
    assert [row["memberName"] for row in learners] == ["Sam"]
    sam = learners[0]
    assert sam["reasons"] == ["inactive", "overdue", "behind", "low_scores", "missed_sessions"]
    assert (sam["progressPct"], sam["firstTryPct"], sam["sessionsMissed"]) == (0, 17, 3)
    assert (sam["cohortName"], sam["crewName"]) == ("Cohort 1", "Falcons")

    # One missed session is below the rule; a second one flags Ben for that alone.
    Attendance.objects.filter(member=cohort.members["ben"]).first().delete()
    flagged = as_("teacher").get("/api/reports/at-risk").data["learners"]
    assert [(row["memberName"], row["reasons"]) for row in flagged][1] == (
        "Ben",
        ["missed_sessions"],
    )
    # A finished course is never inactive or behind.
    LessonProgress.objects.all().delete()
    Enrollment.objects.filter(member=cohort.members["sam"]).update(
        completed_at=timezone.now(), progress_pct=100
    )
    sam = as_("teacher").get("/api/reports/at-risk").data["learners"][0]
    assert sam["memberName"] == "Sam" and sam["reasons"] == ["low_scores", "missed_sessions"]

    # Another tenant's staff see none of this.
    make_member(acme, "outsider", Role.TENANT_ADMIN)
    assert as_("outsider").get("/api/reports/at-risk").data["learners"] == []
    assert as_("outsider").get("/api/reports/analytics").data["totals"]["learners"] == 0


@pytest.mark.skipif(os.environ.get("SCORM_BROWSER") != "1", reason="Opt-in installed Chrome smoke")
def test_real_chrome_scorm_runtime_records_what_the_launcher_is_told(setup, settings):
    dispatch = create(course=setup.course.pk).data
    raw = as_("teacher").get(f"/api/standards/dispatches/{dispatch['id']}/package").content
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        launcher = archive.read("index.html").decode()
    node = shutil.which("node")
    assert node, "Node is required for the Chrome smoke test."
    result = subprocess.run(  # noqa: S603 - fixed repository-owned browser test harness
        [node, str(Path(__file__).with_name("dispatch_browser.mjs"))],
        input=json.dumps(
            {
                "launcher": launcher,
                "runtimePath": settings.SCORM_RUNTIME_PATH,
                "appOrigin": "https://learn.example.test",
                "dispatchId": dispatch["id"],
            }
        ),
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "started": {"status": "incomplete", "score": "", "location": ""},
        "partway": {"status": "incomplete", "score": "", "location": "67"},
        "done": {"status": "completed", "score": "80", "location": "100"},
    }
