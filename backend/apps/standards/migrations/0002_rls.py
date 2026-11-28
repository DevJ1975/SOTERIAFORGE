from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("standards", "0001_initial")]
    operations = [
        migrations.RunSQL(*policy_sql(table))
        for table in ["standards_package", "standards_binding", "standards_launch", "standards_statement"]
    ]
