from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Member, Role
from apps.audit.models import record
from forge import firebase


class Command(BaseCommand):
    help = "Grant platform superadmin to a project-level Firebase user (out-of-band by design)."

    def add_arguments(self, parser):
        parser.add_argument("--uid", required=True, help="Firebase uid in the project-level pool")
        parser.add_argument("--email", required=True)
        parser.add_argument("--no-claims", action="store_true", help="Skip mirroring to Firebase")

    def handle(self, *args, uid, email, no_claims, **options):
        with transaction.atomic():
            member, created = Member.objects.get_or_create(
                tenant=None,
                firebase_uid=uid,
                defaults={"email": email, "role": Role.SUPERADMIN, "status": Member.Status.ACTIVE},
            )
            record(action="member.superadmin.granted", target=member, via="manage.py")
            if not no_claims:
                firebase.set_role_claims(
                    uid=uid, gcip_tenant_id=None, role=Role.SUPERADMIN, tenant_id=None
                )
        self.stdout.write(f"{'Created' if created else 'Kept'} superadmin {member.email}")
