from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("standards", "0005_sim_scenarios")]
    operations = [migrations.RunSQL(*policy_sql("standards_scenario"))]
