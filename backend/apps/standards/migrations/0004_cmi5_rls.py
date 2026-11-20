from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("standards", "0003_cmi5_sessions")]
    operations = [
        migrations.RunSQL(*policy_sql(table))
        for table in ["standards_ausession", "standards_austatement"]
    ]
