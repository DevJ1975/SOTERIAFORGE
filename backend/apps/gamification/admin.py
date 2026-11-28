from django.contrib import admin

from .models import ActivityDay, Cohort, Crew, CrewMembership, Section, XpEvent


@admin.register(XpEvent)
class XpEventAdmin(admin.ModelAdmin):
    list_display = ["created_at", "member", "amount", "source", "tenant"]
    list_filter = ["source", "tenant"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register([ActivityDay, Cohort, Section, Crew, CrewMembership])
