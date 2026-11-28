from rest_framework import serializers

from .models import MAX_PARTICIPANTS, Activity, Classroom


class ClassroomSerializer(serializers.ModelSerializer):
    createdBy = serializers.UUIDField(source="created_by_id", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    maxParticipants = serializers.IntegerField(default=MAX_PARTICIPANTS, read_only=True)
    # Only this cohort's learners may join; null means anyone in the tenant.
    cohortId = serializers.UUIDField(source="cohort_id", required=False, allow_null=True)
    cohortName = serializers.SerializerMethodField()
    liveSessionId = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            "id",
            "title",
            "createdBy",
            "createdAt",
            "maxParticipants",
            "cohortId",
            "cohortName",
            "liveSessionId",
        ]
        read_only_fields = ["id"]

    def get_cohortName(self, room) -> str | None:
        return room.cohort.name if room.cohort_id else None

    def get_liveSessionId(self, room) -> str | None:
        live = self.context.get("live", {})
        return live.get(room.pk)


class JoinSerializer(serializers.Serializer):
    serverUrl = serializers.URLField()
    token = serializers.CharField()
    canScreenShare = serializers.BooleanField()
    sessionId = serializers.UUIDField(allow_null=True)


class StageSerializer(serializers.Serializer):
    key = serializers.SlugField(max_length=20)
    label = serializers.CharField(max_length=20)
    minutes = serializers.IntegerField(min_value=1, max_value=60)


class SessionStartSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, required=False, allow_blank=True)
    blocks = serializers.IntegerField(min_value=1, max_value=8, default=4)
    stages = StageSerializer(many=True, required=False, min_length=1, max_length=8)


class AdvanceSerializer(serializers.Serializer):
    block = serializers.IntegerField(min_value=1, required=False)
    stage = serializers.IntegerField(min_value=0, required=False)


class OptionSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    detail = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")


class ActivityCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Activity.Kind.choices)
    prompt = serializers.CharField(max_length=300)
    options = OptionSerializer(many=True, min_length=2, max_length=8)
    correctIndex = serializers.IntegerField(min_value=0, required=False)
    seconds = serializers.IntegerField(min_value=10, max_value=600, required=False)
    xp = serializers.IntegerField(min_value=0, max_value=200, default=40)

    def validate(self, attrs):
        hunt = attrs["kind"] == Activity.Kind.HUNT
        if hunt and not 0 <= attrs.get("correctIndex", -1) < len(attrs["options"]):
            raise serializers.ValidationError(
                {"correctIndex": ["A Threat Hunt needs one correct option."]}
            )
        if not hunt and "correctIndex" in attrs:
            raise serializers.ValidationError({"correctIndex": ["A poll has no correct option."]})
        attrs.setdefault("seconds", 180 if hunt else 60)
        return attrs


class RespondSerializer(serializers.Serializer):
    optionId = serializers.CharField(max_length=8)


class HuddleSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=2000, allow_blank=True, trim_whitespace=False)


class HandSerializer(serializers.Serializer):
    raised = serializers.BooleanField()


class ModerateSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["mute", "remove", "lower_hand"])


class SessionStateSerializer(serializers.Serializer):
    """The session document (apps/engage/sessions.py `state`). Nested shapes are
    documented in docs/video-classrooms.md."""

    id = serializers.UUIDField()
    classroomId = serializers.UUIDField()
    title = serializers.CharField()
    status = serializers.ChoiceField(choices=["live", "ended"])
    version = serializers.IntegerField()
    serverTime = serializers.DateTimeField()
    block = serializers.DictField()
    activity = serializers.DictField(allow_null=True)
    crew = serializers.DictField(allow_null=True)
    huddle = serializers.DictField(allow_null=True)
    me = serializers.DictField()
    hands = serializers.ListField(child=serializers.DictField())
    crewMemberIds = serializers.ListField(child=serializers.UUIDField())


class AttendanceRowSerializer(serializers.Serializer):
    memberId = serializers.UUIDField()
    name = serializers.CharField()
    crew = serializers.CharField(allow_null=True)
    firstJoinedAt = serializers.DateTimeField()
    lastSeenAt = serializers.DateTimeField()
    minutes = serializers.IntegerField()
    removed = serializers.BooleanField()


class HeatmapSerializer(serializers.Serializer):
    activities = serializers.ListField(child=serializers.DictField())
    crews = serializers.ListField(child=serializers.DictField())
