from rest_framework import serializers

from .models import Exchange
from .profiles import Agent


class IngestSerializer(serializers.Serializer):
    courseId = serializers.UUIDField()
    label = serializers.CharField(max_length=300)
    text = serializers.CharField(max_length=60000, required=False)
    file = serializers.FileField(required=False)
    approved = serializers.BooleanField()
    # A module of the course; omitted or null means the whole course.
    moduleId = serializers.UUIDField(required=False, allow_null=True)
    agent = serializers.ChoiceField(choices=Agent.choices, default=Agent.GENERAL)
    referenceUrl = serializers.URLField(max_length=2048, allow_blank=True, default="")
    edition = serializers.CharField(max_length=200, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs["approved"]:
            raise serializers.ValidationError("Instructor approval is required.")
        if ("text" in attrs) == ("file" in attrs):
            raise serializers.ValidationError("Supply either text or one text/Markdown/PDF file.")
        if attrs["agent"] != Agent.GENERAL and (
            not attrs["referenceUrl"].startswith("https://") or not attrs["edition"].strip()
        ):
            raise serializers.ValidationError(
                "Specialist sources require an HTTPS reference URL and reviewed edition/date."
            )
        return attrs


class QuestionSerializer(serializers.Serializer):
    courseId = serializers.UUIDField()
    question = serializers.CharField(max_length=1000)
    agent = serializers.ChoiceField(choices=Agent.choices, default=Agent.GENERAL)
    # The module the learner is studying: adds that module's sources to the course's.
    moduleId = serializers.UUIDField(required=False, allow_null=True)

    def validate_question(self, value):
        if len(value.encode()) > 1500:
            raise serializers.ValidationError("Question exceeds the 1,500-byte limit.")
        return value


class CoachCourseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()


class SourceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    courseId = serializers.UUIDField()
    moduleId = serializers.UUIDField(allow_null=True)
    title = serializers.CharField()
    chunkCount = serializers.IntegerField()
    updatedAt = serializers.DateTimeField()
    agent = serializers.ChoiceField(choices=Agent.choices)
    referenceUrl = serializers.URLField(allow_blank=True)
    edition = serializers.CharField(allow_blank=True)


class ReferenceSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    url = serializers.URLField()
    edition = serializers.CharField()
    status = serializers.ChoiceField(choices=["pending_instructor_review"])
    checkedOn = serializers.DateField()


class AgentProfileSerializer(serializers.Serializer):
    id = serializers.ChoiceField(choices=Agent.choices)
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    references = ReferenceSerializer(many=True)


class IngestResultSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    chunks = serializers.IntegerField()


class CitationSerializer(serializers.Serializer):
    sourceId = serializers.UUIDField()
    chunkId = serializers.IntegerField()
    label = serializers.CharField()
    courseId = serializers.UUIDField()
    page = serializers.IntegerField(allow_null=True)


class AnswerSerializer(serializers.Serializer):
    exchangeId = serializers.UUIDField(allow_null=True)
    answer = serializers.CharField()
    abstained = serializers.BooleanField()
    citations = CitationSerializer(many=True)
    # See diagrams.py for the four shapes; always carries `type`, `title` and `alt`.
    diagram = serializers.DictField(allow_null=True)
    followUps = serializers.ListField(child=serializers.CharField())


class RatingSerializer(serializers.Serializer):
    rating = serializers.ChoiceField(choices=Exchange.Rating.choices, allow_null=True)
    note = serializers.CharField(max_length=500, allow_blank=True, default="")


class ReviewUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Exchange.ReviewStatus.choices)
    note = serializers.CharField(max_length=1000, allow_blank=True, default="")


class ReviewCitationSerializer(serializers.Serializer):
    label = serializers.CharField()


class ReviewItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    createdAt = serializers.DateTimeField()
    courseId = serializers.UUIDField()
    courseTitle = serializers.CharField()
    moduleId = serializers.UUIDField(allow_null=True)
    agent = serializers.ChoiceField(choices=Agent.choices)
    learner = serializers.CharField()
    question = serializers.CharField()
    answer = serializers.CharField()
    abstained = serializers.BooleanField()
    blocked = serializers.BooleanField()
    rating = serializers.ChoiceField(choices=Exchange.Rating.choices, allow_null=True)
    ratingNote = serializers.CharField(allow_blank=True)
    citations = ReviewCitationSerializer(many=True)
    reason = serializers.ChoiceField(choices=["thumbs_down", "abstained", "blocked"])
    status = serializers.ChoiceField(choices=Exchange.ReviewStatus.choices)
    reviewNote = serializers.CharField(allow_blank=True)
    diagram = serializers.DictField(allow_null=True)


class ReviewSummarySerializer(serializers.Serializer):
    days = serializers.IntegerField()
    asked = serializers.IntegerField()
    helpful = serializers.IntegerField()
    unhelpful = serializers.IntegerField()
    abstained = serializers.IntegerField()
    helpfulRate = serializers.FloatField(allow_null=True)


class ReviewQueueSerializer(serializers.Serializer):
    summary = ReviewSummarySerializer()
    items = ReviewItemSerializer(many=True)
