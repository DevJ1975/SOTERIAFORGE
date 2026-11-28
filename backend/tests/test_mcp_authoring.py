"""Quiz, game and media tools through the real MCP endpoint."""

import httpx
import pytest

from apps.accounts.models import Role
from apps.assets import importer
from apps.assets.models import Asset
from apps.audit.models import AuditEntry
from apps.games.validation import card_game_errors
from apps.learning.models import Course
from conftest import make_member
from tests.mcp_harness import call, data, error, oauth_token

pytestmark = pytest.mark.django_db

MCQ = {
    "id": "q1",
    "type": "mcq",
    "prompt": "What comes first in lockout/tagout?",
    "options": [
        {"id": "a", "text": "Notify affected employees", "isCorrect": True},
        {"id": "b", "text": "Remove the guard"},
    ],
    "feedback": {"correct": "Yes.", "incorrect": "Preparation and notification come first."},
}
PAIRS = {
    "kind": "match_pairs",
    "title": "Energy types",
    "pairs": [
        {
            "id": "p1",
            "question": {"id": "q1", "label": "Hydraulic"},
            "answer": {"id": "a1", "label": "Bleed the lines"},
        },
        {
            "id": "p2",
            "question": {"id": "q2", "label": "Electrical"},
            "answer": {"id": "a2", "label": "Open the disconnect"},
        },
    ],
}


@pytest.fixture
def ana(lakewood):
    return oauth_token(make_member(lakewood, "ana", Role.INSTRUCTOR), lakewood)


@pytest.fixture
def lesson(ana):
    course = data(call(ana, "forge_create_course_draft", title="LOTO"))
    module = data(call(ana, "forge_add_module", course_id=course["id"], title="Basics"))
    made = data(
        call(ana, "forge_add_lesson", module_id=module["id"], title="Intro", content_type="video")
    )
    return {**made, "courseId": course["id"]}


# --- quizzes -----------------------------------------------------------------


def test_create_a_quiz_and_attach_it(ana, lesson):
    quiz = data(call(ana, "forge_create_quiz", title="LOTO check", questions=[MCQ]))
    assert quiz["passThreshold"] == 70 and quiz["questions"][0]["points"] == 1
    attached = data(call(ana, "forge_update_lesson", lesson_id=lesson["id"], quiz_id=quiz["id"]))
    assert attached["quizId"] == quiz["id"]
    listed = data(call(ana, "forge_list_quizzes"))["quizzes"]
    assert listed == [
        {
            "id": quiz["id"],
            "title": "LOTO check",
            "questionCount": 1,
            "passThreshold": 70,
            "maxAttempts": None,
            "lessonCount": 1,
        }
    ]
    detached = data(call(ana, "forge_update_lesson", lesson_id=lesson["id"], detach_quiz=True))
    assert detached["quizId"] is None
    assert AuditEntry.objects.filter(action="assessments.quiz.created").count() == 1


@pytest.mark.parametrize(
    ("question", "message"),
    [
        ({**MCQ, "options": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}]}, "isCorrect"),
        ({**MCQ, "options": [MCQ["options"][0]]}, "at least 2 options"),
        (
            {"id": "o", "type": "ordering", "prompt": "Order", "options": MCQ["options"]},
            "answerKey",
        ),
        ({"id": "f", "type": "fill_in", "prompt": "Name it"}, "accepted answer"),
        ({"id": "m", "type": "matching", "prompt": "Match", "answerKey": ["a-b"]}, "left:right"),
    ],
)
def test_a_quiz_nobody_could_pass_is_refused(ana, question, message):
    assert message in error(call(ana, "forge_create_quiz", title="Bad", questions=[question]))


def test_duplicate_question_ids_are_refused(ana):
    assert "unique" in error(call(ana, "forge_create_quiz", title="Bad", questions=[MCQ, MCQ]))


def test_a_quiz_in_a_published_course_cant_be_changed(ana, lesson):
    quiz = data(call(ana, "forge_create_quiz", title="LOTO check", questions=[MCQ]))
    data(call(ana, "forge_update_lesson", lesson_id=lesson["id"], quiz_id=quiz["id"]))
    renamed = data(call(ana, "forge_update_quiz", quiz_id=quiz["id"], title="LOTO check v2"))
    assert renamed["title"] == "LOTO check v2"  # still a draft course

    Course.objects.filter(pk=lesson["courseId"]).update(status="published")
    easier = {
        **MCQ,
        "options": [{"id": "a", "text": "x"}, {"id": "b", "text": "y", "isCorrect": True}],
    }
    assert "can't be changed here" in error(
        call(ana, "forge_update_quiz", quiz_id=quiz["id"], questions=[easier])
    )
    assert data(call(ana, "forge_get_quiz", quiz_id=quiz["id"]))["questions"][0]["options"][0][
        "isCorrect"
    ]


def test_quizzes_stay_in_their_tenant_and_with_staff(ana, lakewood, acme):
    quiz = data(call(ana, "forge_create_quiz", title="LOTO check", questions=[MCQ]))
    wile = oauth_token(make_member(acme, "wile", Role.TENANT_ADMIN), acme)
    assert "No quiz" in error(call(wile, "forge_get_quiz", quiz_id=quiz["id"]))
    lee = oauth_token(make_member(lakewood, "lee", Role.LEARNER), lakewood)
    assert "can't author courses" in error(call(lee, "forge_get_quiz", quiz_id=quiz["id"]))


# --- games -------------------------------------------------------------------


def test_create_a_game_and_play_it_from_a_lesson(ana, lesson):
    game = data(call(ana, "forge_create_game", title="Energy types", config=PAIRS))
    assert game["engine"] == "phaser" and game["config"]["kind"] == "match_pairs"
    pointed = data(
        call(
            ana,
            "forge_update_lesson",
            lesson_id=lesson["id"],
            content_type="game",
            asset_ref=game["id"],
        )
    )
    assert pointed["assetRef"] == game["id"]
    assert data(call(ana, "forge_list_games"))["games"] == [
        {"id": game["id"], "title": "Energy types", "kind": "match_pairs"}
    ]

    Course.objects.filter(pk=lesson["courseId"]).update(status="published")
    assert "can't be changed here" in error(
        call(ana, "forge_update_game", game_id=game["id"], title="Renamed")
    )


def test_an_unplayable_game_is_refused(ana):
    one_pair = {**PAIRS, "pairs": PAIRS["pairs"][:1]}
    assert "at least 2 pairs" in error(call(ana, "forge_create_game", title="x", config=one_pair))
    assert "Unknown card game kind" in error(
        call(ana, "forge_create_game", title="x", config={"kind": "tetris", "title": "x"})
    )


@pytest.mark.parametrize(
    ("config", "expected"),
    [
        # The same cases as libs/games/src/lib/card-game.model.spec.ts.
        (PAIRS, []),
        (
            {"kind": "flip_reveal", "title": "t", "cards": [{"id": "c", "label": "L"}]},
            ["flip_reveal.cards[0]: revealText is required"],
        ),
        (
            {
                "kind": "flip_reveal",
                "title": " ",
                "cards": [
                    {"id": "c", "label": "L", "revealText": "R"},
                    {"id": "c", "imageUrl": "https://x/y.png", "revealText": "R"},
                ],
                "visibleCount": 0,
            },
            [
                "flip_reveal: title is required",
                "flip_reveal: card ids must be unique",
                "flip_reveal: visibleCount must be >= 1",
            ],
        ),
        (
            {
                "kind": "sort_buckets",
                "title": "t",
                "cards": [{"id": "c1", "label": "Gloves"}],
                "buckets": [
                    {"id": "b1", "label": "PPE", "correctCardIds": ["c1", "c9"]},
                    {"id": "b2", "label": ""},
                ],
            },
            [
                'sort_buckets.buckets[0]: correctCardId "c9" not found in cards',
                "sort_buckets.buckets[1]: label is required",
            ],
        ),
        (
            {
                "kind": "scenario_cards",
                "title": "t",
                "scenarios": [
                    {
                        "id": "s1",
                        "prompt": "A valve is leaking.",
                        "choices": [{"id": "a", "text": "Ignore"}, {"id": "b", "text": ""}],
                    },
                    {"id": "s2", "prompt": "p", "choices": [{"id": "a", "text": "x"}]},
                ],
            },
            [
                "scenario_cards.scenarios[0]: at least one choice must be correct",
                "scenario_cards.scenarios[0].choices[1]: text is required",
                "scenario_cards.scenarios[1]: at least 2 choices are required",
            ],
        ),
        (
            {"kind": "match_pairs", "title": "t", "pairs": "nope"},
            ["match_pairs: at least 2 pairs are required"],
        ),
    ],
)
def test_card_game_rules_match_the_frontend(config, expected):
    assert card_game_errors(config) == expected


# --- media -------------------------------------------------------------------


class FakeStream:
    def __init__(self, status=200, headers=None, body=b"ID3 audio bytes"):
        self.status_code = status
        self.headers = httpx.Headers(headers or {"content-type": "audio/mpeg"})
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_bytes(self, _size):
        yield self._body


@pytest.fixture
def media(monkeypatch, settings, tmp_path):
    """An allowlisted host that resolves publicly, a fake download, local storage."""
    settings.MCP_MEDIA_IMPORT_HOSTS = ["api.elevenlabs.io", ".cdn.example.com"]
    settings.DEBUG = True
    settings.STANDARDS_LOCAL_ROOT = str(tmp_path)
    seen = {"response": FakeStream(), "requests": []}
    monkeypatch.setattr(importer, "public_address", lambda host: "93.184.216.34")

    def stream(self, method, url, **kwargs):
        seen["requests"].append((url, kwargs))
        return seen["response"]

    monkeypatch.setattr(httpx.Client, "stream", stream)
    return seen


def test_import_media_stores_the_file_and_attaches_to_a_lesson(ana, lesson, media, tmp_path):
    asset = data(
        call(ana, "forge_import_media", url="https://api.elevenlabs.io/v1/history/abc/audio.mp3")
    )
    assert asset["filename"] == "audio.mp3" and asset["contentType"] == "audio/mpeg"
    assert asset["size"] == len(b"ID3 audio bytes")
    stored = Asset.objects.get(pk=asset["id"])
    assert (tmp_path / stored.key).read_bytes() == b"ID3 audio bytes"

    # The connection goes to the address that was checked, still as the named host.
    url, kwargs = media["requests"][0]
    assert url == "https://93.184.216.34/v1/history/abc/audio.mp3"
    assert kwargs["headers"]["Host"] == "api.elevenlabs.io"
    assert kwargs["extensions"] == {"sni_hostname": "api.elevenlabs.io"}

    attached = data(
        call(ana, "forge_update_lesson", lesson_id=lesson["id"], asset_ref=asset["assetRef"])
    )
    assert attached["assetRef"] == f"asset:{asset['id']}"
    entry = AuditEntry.objects.get(action="assets.asset.imported")
    assert entry.details["sourceHost"] == "api.elevenlabs.io" and entry.details["via"] == "mcp"
    assert data(call(ana, "forge_list_assets", search="audio"))["assets"][0]["id"] == asset["id"]


@pytest.mark.parametrize(
    ("url", "message"),
    [
        ("http://api.elevenlabs.io/a.mp3", "Only https://"),
        ("https://user:pw@api.elevenlabs.io/a.mp3", "Only https://"),
        ("https://api.elevenlabs.io:8443/a.mp3", "default https port"),
        ("https://169.254.169.254/latest/meta-data", "isn't an allowed media host"),
        ("https://localhost/a.mp3", "isn't an allowed media host"),
        ("https://evil.example/a.mp3", "isn't an allowed media host"),
        ("https://api.elevenlabs.io.evil.example/a.mp3", "isn't an allowed media host"),
        ("https://notcdn.example.com/a.mp3", "isn't an allowed media host"),
        ("file:///etc/passwd", "Only https://"),
    ],
)
def test_import_refuses_urls_off_the_allowlist(ana, media, url, message):
    assert message in error(call(ana, "forge_import_media", url=url))
    assert media["requests"] == [] and not Asset.objects.exists()


def test_import_allows_subdomains_only_of_dotted_entries(media):
    assert importer.host_allowed("files.cdn.example.com")
    assert not importer.host_allowed("cdn.example.com")
    assert not importer.host_allowed("sub.api.elevenlabs.io")


def test_import_refuses_hosts_that_resolve_privately(ana, media, monkeypatch):
    monkeypatch.undo()  # the real resolver check
    for address in ("127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "fd00::1"):
        monkeypatch.setattr(
            importer.socket, "getaddrinfo", lambda *a, _ip=address, **k: [(0, 0, 0, "", (_ip, 443))]
        )
        with pytest.raises(importer.ImportRefused, match="public address"):
            importer.public_address("api.elevenlabs.io")
    # One private address among public ones is enough to refuse.
    monkeypatch.setattr(
        importer.socket,
        "getaddrinfo",
        lambda *a, **k: [(0, 0, 0, "", ("93.184.216.34", 443)), (0, 0, 0, "", ("10.0.0.1", 443))],
    )
    with pytest.raises(importer.ImportRefused):
        importer.public_address("api.elevenlabs.io")


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (FakeStream(status=302, headers={"location": "http://10.0.0.1/"}), "redirects aren't"),
        (FakeStream(headers={"content-type": "text/html"}), "not allowed"),
        (FakeStream(headers={"content-type": "image/svg+xml"}), "not allowed"),
        (FakeStream(body=b""), "empty"),
        (
            FakeStream(headers={"content-type": "audio/mpeg", "content-length": str(10**9)}),
            "at most 100 MB",
        ),
    ],
)
def test_import_refuses_bad_downloads(ana, media, response, message):
    media["response"] = response
    assert message in error(call(ana, "forge_import_media", url="https://api.elevenlabs.io/a.mp3"))
    assert not Asset.objects.exists()


def test_import_stops_at_the_size_limit_even_without_a_length_header(ana, media, monkeypatch):
    monkeypatch.setattr("apps.assets.service.MAX_UPLOAD_BYTES", 4)
    assert "at most 100 MB" in error(
        call(ana, "forge_import_media", url="https://api.elevenlabs.io/a.mp3")
    )


def test_import_is_off_until_hosts_are_configured(ana, settings):
    settings.MCP_MEDIA_IMPORT_HOSTS = []
    assert "Media import is off" in error(
        call(ana, "forge_import_media", url="https://api.elevenlabs.io/a.mp3")
    )


def test_learners_cant_import(lakewood, media):
    lee = oauth_token(make_member(lakewood, "lee", Role.LEARNER), lakewood)
    assert "can't author courses" in error(
        call(lee, "forge_import_media", url="https://api.elevenlabs.io/a.mp3")
    )
    assert media["requests"] == []
