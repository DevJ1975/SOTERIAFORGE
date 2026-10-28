from django.db import migrations

from apps.tenants import rls
from apps.tenants.rls import policy_sql

TABLES = ["gamification_badge", "gamification_badgeaward"]


def starter_catalog(apps, schema_editor):
    """Give every existing tenant (not the shared library) the starter badges."""
    from apps.gamification.badges import DEFAULT_BADGES

    Tenant = apps.get_model("tenants", "Tenant")
    Badge = apps.get_model("gamification", "Badge")
    rls.set_bypass(True)
    try:
        for tenant in Tenant.objects.exclude(id="library"):
            for order, (key, name, icon, kind, rule, target, text) in enumerate(DEFAULT_BADGES):
                Badge.objects.get_or_create(
                    tenant=tenant,
                    key=key,
                    defaults={
                        "name": name,
                        "icon": icon,
                        "kind": kind,
                        "rule": rule,
                        "target": target,
                        "description": text,
                        "order": order,
                    },
                )
    finally:
        rls.set_bypass(False)


class Migration(migrations.Migration):
    dependencies = [("gamification", "0003_badges"), ("tenants", "0003_drop_firebase")]
    operations = [migrations.RunSQL(*policy_sql(table)) for table in TABLES] + [
        migrations.RunPython(starter_catalog, migrations.RunPython.noop)
    ]
