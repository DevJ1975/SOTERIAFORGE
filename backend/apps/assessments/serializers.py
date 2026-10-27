import json

from rest_framework import serializers

from apps.learning.serializers import CompletionSerializer

from .grading import QuestionListSerializer, ResponseSerializer
from .models import Quiz


class QuizSerializer(serializers.ModelSerializer):
    """Full quiz, answer key included: authors only."""

    # Stored as JSON; validated with QuestionListSerializer (nested writes stay out of DRF).
    questions = serializers.JSONField(required=False)
    passThreshold = serializers.IntegerField(
        source="pass_threshold", min_value=0, max_value=100, required=False
    )
    maxAttempts = serializers.IntegerField(
        source="max_attempts", min_value=1, allow_null=True, required=False
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Quiz
        fields = [
            "id",
            "title",
            "questions",
            "passThreshold",
            "maxAttempts",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id"]

    def validate_questions(self, value):
        parsed = QuestionListSerializer(data=value)
        if not isinstance(value, list) or not parsed.is_valid():
            raise serializers.ValidationError(
                parsed.errors if isinstance(value, list) else "Expected a list."
            )
        return json.loads(json.dumps(parsed.validated_data))  # plain dicts for the JSON column


class CheckAnswerSerializer(ResponseSerializer):
    """One knowledge-check answer: `{questionId, selectedOptionIds | text | order}`."""


class AttemptSerializer(serializers.Serializer):
    responses = ResponseSerializer(many=True, max_length=200)


class CheckResultSerializer(serializers.Serializer):
    questionId = serializers.CharField()
    correct = serializers.BooleanField()
    firstTry = serializers.BooleanField()
    solved = serializers.BooleanField()
    feedback = serializers.CharField(allow_null=True)
    completion = CompletionSerializer(allow_null=True)


class QuestionResultSerializer(serializers.Serializer):
    questionId = serializers.CharField()
    correct = serializers.BooleanField()
    awardedPoints = serializers.IntegerField()


class AttemptResultSerializer(serializers.Serializer):
    earnedPoints = serializers.IntegerField()
    totalPoints = serializers.IntegerField()
    scorePct = serializers.IntegerField()
    passed = serializers.BooleanField()
    perQuestion = QuestionResultSerializer(many=True)
    attemptsUsed = serializers.IntegerField()
    attemptsRemaining = serializers.IntegerField(allow_null=True)
    completion = CompletionSerializer(allow_null=True)
