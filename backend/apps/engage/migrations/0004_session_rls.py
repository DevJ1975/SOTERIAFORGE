from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("engage", "0003_live_sessions")]
    operations = [
        migrations.RunSQL(*policy_sql(table))
        for table in [
            "engage_session",
            "engage_activity",
            "engage_response",
            "engage_huddlenote",
            "engage_attendance",
        ]
    ]
