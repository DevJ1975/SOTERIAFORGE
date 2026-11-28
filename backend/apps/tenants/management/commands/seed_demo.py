"""Create a demo tenant with sign-in accounts and the demo course, for the Docker stack.

    python manage.py seed_demo

Idempotent, and refuses to run unless DJANGO_DEBUG is on: these accounts share one
well-known password and must never exist in a deployed environment.
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import Member, Role
from apps.gamification.badges import ensure_default_badges
from apps.tenants import rls
from apps.tenants.models import Tenant

TENANT_ID = "lakewood"
PASSWORD = "ForgeDemo!2026"  # noqa: S105  (dev-only; the command needs DEBUG)

ACCOUNTS = [
    ("root@soteriaforge.test", "Platform Admin", Role.SUPERADMIN, None),
    ("admin@lakewood.test", "Jamie Admin", Role.TENANT_ADMIN, TENANT_ID),
    ("instructor@lakewood.test", "Ira Instructor", Role.INSTRUCTOR, TENANT_ID),
    ("learner@lakewood.test", "Lee Learner", Role.LEARNER, TENANT_ID),
]


class Command(BaseCommand):
    help = "Create the demo tenant, demo accounts and the demo course (DEBUG only)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DJANGO_DEBUG on.")
        with rls.bypass():
            tenant, _ = Tenant.objects.get_or_create(
                id=TENANT_ID,
                defaults={"name": "Lakewood University", "status": Tenant.Status.ACTIVE},
            )
            for email, name, role, tenant_id in ACCOUNTS:
                member, _ = Member.objects.get_or_create(
                    email=email,
                    tenant=tenant if tenant_id else None,
                    defaults={"display_name": name, "role": role},
                )
                member.display_name, member.role = name, role
                member.status = Member.Status.ACTIVE
                member.set_password(PASSWORD)
                member.save()
        ensure_default_badges(tenant)
        call_command("seed_course", tenant=TENANT_ID, publish=True, stdout=self.stdout)
        self.stdout.write(f"Demo ready: tenant '{TENANT_ID}', password '{PASSWORD}'.")
        for email, _, role, _ in ACCOUNTS:
            self.stdout.write(f"  {role:13} {email}")
