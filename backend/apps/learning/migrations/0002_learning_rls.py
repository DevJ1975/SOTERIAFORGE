from django.db import migrations

from apps.tenants.rls import policy_sql

TABLES = [
    "learning_course",
    "learning_module",
    "learning_lesson",
    "learning_enrollment",
    "learning_lessonprogress",
]


class Migration(migrations.Migration):
    dependencies = [("learning", "0001_initial")]
    operations = [migrations.RunSQL(*policy_sql(table)) for table in TABLES]
