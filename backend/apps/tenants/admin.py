from django.contrib import admin

from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "status", "plan"]
    list_filter = ["status", "plan"]
    search_fields = ["id", "name"]
