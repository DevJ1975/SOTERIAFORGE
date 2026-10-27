from rest_framework import serializers

from .models import Cohort, Crew, Section


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
