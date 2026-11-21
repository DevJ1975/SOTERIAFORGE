from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("coach", "0004_module_scope_and_exchange_log")]
    operations = [migrations.RunSQL(*policy_sql("coach_exchange"))]
