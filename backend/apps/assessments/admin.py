from django.contrib import admin

from .models import Quiz


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ["title", "tenant", "pass_threshold", "max_attempts", "updated_at"]
    list_filter = ["tenant"]
    search_fields = ["title"]
