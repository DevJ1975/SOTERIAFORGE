from django.contrib import admin

from .models import Member


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ["email", "tenant", "role", "status"]
    list_filter = ["role", "status", "tenant"]
    search_fields = ["email", "firebase_uid", "display_name"]
    # Role changes go through the API so they are audited and mirrored to Firebase.
    readonly_fields = ["role"]
