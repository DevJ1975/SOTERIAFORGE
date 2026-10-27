from django.db import migrations

from apps.tenants.rls import policy_sql


class Migration(migrations.Migration):
    dependencies = [("assets", "0001_initial")]
    operations = [migrations.RunSQL(*policy_sql("assets_asset"))]
