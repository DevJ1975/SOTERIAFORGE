from django.contrib import admin

from .models import Course, Enrollment, Lesson, Module


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ["title", "tenant", "status", "updated_at"]
    list_filter = ["status", "tenant"]
    search_fields = ["title"]


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ["title", "course", "label", "order"]
    list_filter = ["tenant"]


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ["title", "module", "content_type", "order"]
    list_filter = ["tenant", "content_type"]


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ["member", "course", "progress_pct", "completed_at", "last_activity_at"]
    list_filter = ["tenant"]
    readonly_fields = ["progress_pct", "completed_at"]
