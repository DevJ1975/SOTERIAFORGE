from rest_framework import serializers

from .models import MAX_PARTICIPANTS, Classroom


class ClassroomSerializer(serializers.ModelSerializer):
    createdBy = serializers.UUIDField(source="created_by_id", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    maxParticipants = serializers.IntegerField(default=MAX_PARTICIPANTS, read_only=True)

    class Meta:
        model = Classroom
        fields = ["id", "title", "createdBy", "createdAt", "maxParticipants"]
        read_only_fields = ["id"]


class JoinSerializer(serializers.Serializer):
    serverUrl = serializers.URLField()
    token = serializers.CharField()
    canScreenShare = serializers.BooleanField()
