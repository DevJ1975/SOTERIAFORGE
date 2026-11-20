import json

from rest_framework import serializers

from .models import Package, Statement


class PackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Package
        fields = ["id", "title", "status", "sha256", "scorm_version", "error", "created_at"]
        read_only_fields = fields


class UploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=300)
    file = serializers.FileField()


class AttachSerializer(serializers.Serializer):
    moduleId = serializers.UUIDField()
    title = serializers.CharField(max_length=300)


class CommitSerializer(serializers.Serializer):
    sequence = serializers.IntegerField(min_value=1, max_value=1_000_000)
    cmi = serializers.DictField()

    def validate_cmi(self, value):
        try:
            encoded = json.dumps(value, allow_nan=False)
        except (ValueError, TypeError, RecursionError) as error:
            raise serializers.ValidationError("Invalid runtime JSON.") from error
        if len(encoded.encode()) > 64_000 or "\u0000" in encoded.replace("\\u0000", "\u0000"):
            raise serializers.ValidationError("Runtime exceeds 64 KB or contains NUL characters.")
        return value


class LaunchSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    url = serializers.URLField()
    origin = serializers.URLField()
    expiresAt = serializers.DateTimeField()


class CommitResultSerializer(serializers.Serializer):
    sequence = serializers.IntegerField()
    completion = serializers.JSONField(allow_null=True)


class StatementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Statement
        fields = ["id", "attempts", "next_attempt_at", "delivered_at", "last_error", "created_at"]


class AttachResultSerializer(serializers.Serializer):
    lessonId = serializers.UUIDField()


class ConfigurationSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    storageConfigured = serializers.BooleanField()
    contentOriginConfigured = serializers.BooleanField()
    xapiRecordingEnabled = serializers.BooleanField()
    lrsConfigured = serializers.BooleanField()


class AuLaunchSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    auUrl = serializers.CharField()
    endpoint = serializers.URLField()
    fetch = serializers.URLField()
    actor = serializers.CharField(help_text="JSON-serialised xAPI Agent.")
    registration = serializers.UUIDField()
    activityId = serializers.CharField()
    expiresAt = serializers.DateTimeField()


class AuSessionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    active = serializers.BooleanField()
    initialized = serializers.BooleanField()
    completed = serializers.BooleanField()
    success = serializers.BooleanField(allow_null=True)
    terminated = serializers.BooleanField()
    score = serializers.IntegerField(allow_null=True)
    completion = serializers.JSONField(allow_null=True)
