from django.contrib import admin

from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "status", "plan", "gcip_tenant_id"]
    list_filter = ["status", "plan"]
    search_fields = ["id", "name"]
