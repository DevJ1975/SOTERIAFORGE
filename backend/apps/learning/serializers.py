import json

from rest_framework import serializers

from .models import CONTENT_TYPES, Course, Enrollment, Lesson, Module, PublishStatus

short_labels = serializers.ListField(
    child=serializers.CharField(max_length=100), max_length=30, required=False
)


class KeyPointSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(max_length=2000, allow_blank=True, required=False, default="")


class CourseSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=PublishStatus.choices, required=False)
    tags = short_labels
    availableOffline = serializers.BooleanField(source="available_offline", required=False)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "description",
            "status",
            "tags",
            "availableOffline",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id"]


class ModuleSerializer(serializers.ModelSerializer):
    courseId = serializers.UUIDField(source="course_id", read_only=True)

    class Meta:
        model = Module
        fields = ["id", "courseId", "title", "label", "order"]
        read_only_fields = ["id"]


class LessonWriteSerializer(serializers.ModelSerializer):
    contentType = serializers.ChoiceField(source="content_type", choices=CONTENT_TYPES)
    assetRef = serializers.CharField(
        source="asset_ref", max_length=1024, allow_blank=True, required=False
    )
    externalUrl = serializers.URLField(
        source="external_url", max_length=2048, allow_blank=True, required=False
    )
    scormVersion = serializers.ChoiceField(
        source="scorm_version", choices=["1.2", "2004"], allow_blank=True, required=False
    )
    estimatedMinutes = serializers.IntegerField(
        source="estimated_minutes", min_value=0, allow_null=True, required=False
    )
    frameworkTags = serializers.ListField(
        source="framework_tags",
        child=serializers.CharField(max_length=100),
        max_length=30,
        required=False,
    )
    keyPoints = KeyPointSerializer(source="key_points", many=True, required=False)
    # Resolved against the acting tenant's quizzes by the view.
    quizId = serializers.UUIDField(allow_null=True, required=False, write_only=True)

    class Meta:
        model = Lesson
        fields = [
            "title",
            "order",
            "contentType",
            "assetRef",
            "externalUrl",
            "scormVersion",
            "estimatedMinutes",
            "frameworkTags",
            "keyPoints",
            "quizId",
        ]

    def validate_keyPoints(self, value):  # noqa: N802 (DRF naming)
        if len(value) > 20:
            raise serializers.ValidationError("At most 20 key points.")
        return [dict(kp) for kp in value]


def lesson_summary(lesson: Lesson, completed_ids: set) -> dict:
    return {
        "id": str(lesson.pk),
        "title": lesson.title,
        "order": lesson.order,
        "contentType": lesson.content_type,
        "estimatedMinutes": lesson.estimated_minutes,
        "frameworkTags": lesson.framework_tags,
        "hasQuiz": lesson.quiz_id is not None,
        "completed": lesson.pk in completed_ids,
    }


class EnrollmentSerializer(serializers.ModelSerializer):
    courseId = serializers.UUIDField(source="course_id", read_only=True)
    memberId = serializers.UUIDField(source="member_id", read_only=True)
    assigned = serializers.SerializerMethodField()
    dueAt = serializers.DateTimeField(source="due_at", read_only=True)
    progressPct = serializers.IntegerField(source="progress_pct", read_only=True)
    completedAt = serializers.DateTimeField(source="completed_at", read_only=True)
    lastActivityAt = serializers.DateTimeField(source="last_activity_at", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "courseId",
            "memberId",
            "assigned",
            "dueAt",
            "progressPct",
            "completedAt",
            "lastActivityAt",
            "createdAt",
        ]

    def get_assigned(self, obj) -> bool:
        return obj.assigned_by_id is not None


class AssignSerializer(serializers.Serializer):
    memberIds = serializers.ListField(
        child=serializers.UUIDField(), min_length=1, max_length=500, allow_empty=False
    )
    dueAt = serializers.DateTimeField(required=False, allow_null=True)


class CompleteSerializer(serializers.Serializer):
    score = serializers.IntegerField(min_value=0, max_value=100, required=False)


class RuntimeSerializer(serializers.Serializer):
    """SCORM/cmi5 runtime state for one lesson (bookmark, suspend data, ...)."""

    cmi = serializers.DictField()

    def validate_cmi(self, value):
        if len(json.dumps(value)) > 64_000:
            raise serializers.ValidationError("Runtime data is too large.")
        return value


# --- Response shapes built by the views (documented for OpenAPI) -------------


class LessonSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    order = serializers.IntegerField()
    contentType = serializers.ChoiceField(choices=CONTENT_TYPES)
    estimatedMinutes = serializers.IntegerField(allow_null=True)
    frameworkTags = serializers.ListField(child=serializers.CharField())
    hasQuiz = serializers.BooleanField()
    completed = serializers.BooleanField()


class ModuleOutlineSerializer(ModuleSerializer):
    lessons = LessonSummarySerializer(many=True)

    class Meta(ModuleSerializer.Meta):
        fields = [*ModuleSerializer.Meta.fields, "lessons"]


class CourseOutlineSerializer(CourseSerializer):
    modules = ModuleOutlineSerializer(many=True)
    enrollment = EnrollmentSerializer(allow_null=True)

    class Meta(CourseSerializer.Meta):
        fields = [*CourseSerializer.Meta.fields, "modules", "enrollment"]


class PublicOptionSerializer(serializers.Serializer):
    id = serializers.CharField()
    text = serializers.CharField()


class PublicQuestionSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField()
    prompt = serializers.CharField()
    points = serializers.IntegerField()
    options = PublicOptionSerializer(many=True)


class AnsweredSerializer(serializers.Serializer):
    firstCorrect = serializers.BooleanField()
    solved = serializers.BooleanField()


class LessonQuizSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    mode = serializers.ChoiceField(choices=["graded", "check"])
    passThreshold = serializers.IntegerField()
    maxAttempts = serializers.IntegerField(allow_null=True)
    questions = PublicQuestionSerializer(many=True)
    answered = serializers.DictField(child=AnsweredSerializer())


class LessonProgressSerializer(serializers.Serializer):
    completedAt = serializers.DateTimeField(allow_null=True)
    score = serializers.IntegerField(allow_null=True)
    runtime = serializers.DictField()


class LessonDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    courseId = serializers.UUIDField()
    moduleId = serializers.UUIDField()
    moduleTitle = serializers.CharField()
    moduleLabel = serializers.CharField()
    title = serializers.CharField()
    order = serializers.IntegerField()
    contentType = serializers.ChoiceField(choices=CONTENT_TYPES)
    assetRef = serializers.CharField()
    externalUrl = serializers.CharField()
    scormVersion = serializers.CharField()
    estimatedMinutes = serializers.IntegerField(allow_null=True)
    frameworkTags = serializers.ListField(child=serializers.CharField())
    keyPoints = KeyPointSerializer(many=True)
    quiz = LessonQuizSerializer(allow_null=True)
    progress = LessonProgressSerializer(allow_null=True)


class CourseRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()


class NextLessonSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    moduleTitle = serializers.CharField()
    moduleLabel = serializers.CharField()
    estimatedMinutes = serializers.IntegerField(allow_null=True)


class MyEnrollmentSerializer(EnrollmentSerializer):
    course = CourseRefSerializer()
    nextLesson = NextLessonSerializer(allow_null=True)

    class Meta(EnrollmentSerializer.Meta):
        fields = [*EnrollmentSerializer.Meta.fields, "course", "nextLesson"]


class AssignResultSerializer(serializers.Serializer):
    assigned = serializers.IntegerField()
    skipped = serializers.IntegerField()


class CompletionSerializer(serializers.Serializer):
    progressPct = serializers.IntegerField()
    completed = serializers.BooleanField()
    firstCompletion = serializers.BooleanField()
