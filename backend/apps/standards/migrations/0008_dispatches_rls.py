from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("standards", "0007_dispatches")]
    operations = [migrations.RunSQL(*policy_sql("standards_dispatch"))]
