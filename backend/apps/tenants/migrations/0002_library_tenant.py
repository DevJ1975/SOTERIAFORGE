from django.db import migrations

LIBRARY_ID = "library"


def create_library(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    Tenant.objects.get_or_create(
        id=LIBRARY_ID,
        defaults={
            "name": "Course library",
            "status": "archived",
            "plan": "platform",
            "branding": {"colors": {}},
        },
    )


def remove_library(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    Tenant.objects.filter(id=LIBRARY_ID).delete()


class Migration(migrations.Migration):
    dependencies = [("tenants", "0001_initial")]
    operations = [migrations.RunPython(create_library, remove_library)]
