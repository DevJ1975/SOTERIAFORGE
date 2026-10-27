from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("games", "0001_initial")]
    operations = [migrations.RunSQL(*policy_sql("games_game"))]
