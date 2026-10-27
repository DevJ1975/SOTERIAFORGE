from django.db import migrations

from apps.tenants.rls import policy_sql

TABLES = ["assessments_quiz", "assessments_checkanswer", "assessments_quizattempt"]


class Migration(migrations.Migration):
    dependencies = [("assessments", "0002_initial")]
    operations = [migrations.RunSQL(*policy_sql(table)) for table in TABLES]
