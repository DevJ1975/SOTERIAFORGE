import os

from django.core.management.base import BaseCommand, CommandError

from apps.tenants.dbroles import APP_ROLE, ensure_app_role


class Command(BaseCommand):
    help = "Create/update the RLS-bound runtime DB role (run as owner after migrate)."

    def handle(self, *args, **options):
        role = os.environ.get("DB_APP_USER", APP_ROLE)
        password = os.environ.get("DB_APP_PASSWORD", "")
        if not password:
            raise CommandError("Set DB_APP_PASSWORD (the runtime role's login password).")
        ensure_app_role(role, password)
        self.stdout.write(f"Runtime role {role} is up to date")
