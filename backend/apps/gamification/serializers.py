from rest_framework import serializers

from .models import Badge, BadgeRule, Cohort, Crew, Section


class CohortSerializer(serializers.ModelSerializer):
    startsOn = serializers.DateField(source="starts_on", required=False, allow_null=True)
    endsOn = serializers.DateField(source="ends_on", required=False, allow_null=True)

    class Meta:
        model = Cohort
        fields = ["id", "name", "startsOn", "endsOn"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        starts = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        ends = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if starts and ends and ends < starts:
            raise serializers.ValidationError({"endsOn": ["Must not be before the start date."]})
        return attrs


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ["id", "name"]
        read_only_fields = ["id"]


class CrewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Crew
        fields = ["id", "name"]
        read_only_fields = ["id"]


class CrewMembersSerializer(serializers.Serializer):
    memberIds = serializers.ListField(
        child=serializers.UUIDField(), max_length=50, allow_empty=True
    )
    leadIds = serializers.ListField(
        child=serializers.UUIDField(), max_length=10, required=False, default=list
    )

    def validate(self, attrs):
        if len(set(attrs["memberIds"])) != len(attrs["memberIds"]):
            raise serializers.ValidationError({"memberIds": ["Duplicate members."]})
        if not set(attrs["leadIds"]) <= set(attrs["memberIds"]):
            raise serializers.ValidationError({"leadIds": ["Leads must be crew members."]})
        return attrs


# --- Response shapes (documented for OpenAPI) ---------------------------------


class CrewRowSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    crewId = serializers.UUIDField()
    name = serializers.CharField()
    score = serializers.IntegerField()
    totalXp = serializers.IntegerField()
    memberCount = serializers.IntegerField()
    mine = serializers.BooleanField()


class CohortRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class CrewBoardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=["daily", "weekly", "allTime"])
    scoring = serializers.CharField()
    cohort = CohortRefSerializer(allow_null=True)
    crews = CrewRowSerializer(many=True)


class MyCrewSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    isLead = serializers.BooleanField()
    rank = serializers.IntegerField(allow_null=True)
    score = serializers.IntegerField()
    cohort = serializers.CharField()


class ScoreCardSerializer(serializers.Serializer):
    totalXp = serializers.IntegerField()
    todayXp = serializers.IntegerField()
    level = serializers.IntegerField()
    xpIntoLevel = serializers.IntegerField()
    xpToNext = serializers.IntegerField()
    streakDays = serializers.IntegerField()
    strip = serializers.ListField(child=serializers.BooleanField())
    crew = MyCrewSerializer(allow_null=True)


class AwardSerializer(serializers.Serializer):
    awarded = serializers.IntegerField()
    totalXp = serializers.IntegerField()
    level = serializers.IntegerField()
    leveledUp = serializers.BooleanField()
    streakDays = serializers.IntegerField()
    streakExtended = serializers.BooleanField()


class StaffCrewSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    members = serializers.ListField(child=serializers.DictField())


class StaffSectionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    crews = StaffCrewSerializer(many=True)


class CohortTreeSerializer(CohortSerializer):
    sections = StaffSectionSerializer(many=True)

    class Meta(CohortSerializer.Meta):
        fields = [*CohortSerializer.Meta.fields, "sections"]


class BadgeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Badge
        fields = [
            "id",
            "key",
            "name",
            "description",
            "icon",
            "kind",
            "rule",
            "target",
            "order",
            "active",
        ]
        read_only_fields = ["id"]
        # The (tenant, key) uniqueness is checked in the view: tenant isn't a body field.
        extra_kwargs = {
            "key": {"validators": []},
            "target": {"min_value": 1, "max_value": 1_000_000},
            "order": {"max_value": 10_000},
        }

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", Badge.Kind.MISSION))
        rule = attrs.get("rule", getattr(self.instance, "rule", BadgeRule.MANUAL))
        if kind == Badge.Kind.CREDENTIAL and rule != BadgeRule.MANUAL:
            raise serializers.ValidationError(
                {"rule": ["Credentials are signed off by an instructor (rule: manual)."]}
            )
        return attrs


class BadgeProgressSerializer(serializers.Serializer):
    current = serializers.IntegerField()
    target = serializers.IntegerField()


class MemberBadgeSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    icon = serializers.CharField()
    kind = serializers.ChoiceField(choices=Badge.Kind.choices)
    state = serializers.ChoiceField(choices=["earned", "credential", "progress", "locked"])
    progress = BadgeProgressSerializer(allow_null=True)
    earnedAt = serializers.DateTimeField(allow_null=True)


class BadgeSignOffSerializer(serializers.Serializer):
    memberId = serializers.UUIDField()
