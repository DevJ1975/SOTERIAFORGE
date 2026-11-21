"""Deterministic checks that run before any model call, and redaction for the log.

These are pattern checks, not a content-safety classifier: they stop the plainest
misuse cheaply and predictably, and everything they stop lands in the staff review
queue. The model-side rules (answer only from sources, cite, abstain) still apply to
whatever passes.
"""

import re

ASSESSMENT = "assessment"
INSTRUCTIONS = "instructions"

MESSAGES = {
    ASSESSMENT: (
        "I can't give answers to quizzes, tests or knowledge checks. Ask me to explain "
        "the idea behind the question and I'll help you work it out."
    ),
    INSTRUCTIONS: (
        "I can only help with questions about this course's material. "
        "Try asking about a topic from the lesson."
    ),
}

_ASSESSMENT = re.compile(
    r"\banswer\s+keys?\b"
    r"|\b(?:correct\s+)?answers?\s+(?:to|for|on)\s+(?:the\s+|this\s+|my\s+|that\s+)?"
    r"(?:quiz|test|exam|assessment|knowledge\s+check|final)\b"
    r"|\b(?:quiz|test|exam|assessment|knowledge\s+check)\s+answers?\b"
    r"|\banswers?\s+(?:to|for)\s+question\s+#?\d+\b",
    re.IGNORECASE,
)
_INSTRUCTIONS = re.compile(
    r"\b(?:ignore|disregard|forget|override)\b[^.?!\n]{0,40}"
    r"\b(?:instructions?|rules?|prompts?|guidelines?)\b"
    r"|\b(?:system|developer)\s+(?:prompt|message|instructions?)\b"
    r"|\bjailbreak\b"
    r"|\byou\s+are\s+now\s+(?:a|an|in)\b",
    re.IGNORECASE,
)

_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_PHONE = re.compile(
    r"(?<![\w-])(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w-])"
)


def blocked_reason(question: str) -> str | None:
    """Why this question is refused without calling the model, or None."""
    if _ASSESSMENT.search(question):
        return ASSESSMENT
    if _INSTRUCTIONS.search(question):
        return INSTRUCTIONS
    return None


def redact(text: str) -> str:
    """Remove contact details and SSNs. The model and the log only ever see this form."""
    text = _EMAIL.sub("[email]", text)
    text = _SSN.sub("[id number]", text)
    return _PHONE.sub("[phone]", text)
