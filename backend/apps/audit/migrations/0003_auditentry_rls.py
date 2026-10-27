from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("audit", "0002_append_only_trigger")]
    operations = [migrations.RunSQL(*policy_sql("audit_auditentry"))]
