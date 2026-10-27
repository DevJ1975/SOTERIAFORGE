from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("coach", "0001_initial")]
    operations = [
        migrations.RunSQL(*policy_sql(table)) for table in ["coach_source", "coach_chunk"]
    ]
