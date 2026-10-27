from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Member, Role
from apps.audit.models import record
from apps.tenants import rls
from forge import firebase


class Command(BaseCommand):
    help = (
        "Grant platform superadmin (out-of-band by design). Then set a password with "
        "`manage.py set_member_password --email ...`."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--uid", help="Firebase uid, only for accounts still on Firebase")
        parser.add_argument("--no-claims", action="store_true", help="Skip mirroring to Firebase")

    def handle(self, *args, email, uid, no_claims, **options):
        email = email.strip().lower()
        with transaction.atomic(), rls.bypass():
            member = Member.objects.filter(tenant__isnull=True, email__iexact=email).first()
            created = member is None
            if created:
                member = Member.objects.create(
                    tenant=None,
                    email=email,
                    firebase_uid=uid or None,
                    role=Role.SUPERADMIN,
                    status=Member.Status.ACTIVE,
                )
            elif member.role != Role.SUPERADMIN:
                raise CommandError(f"{email} is a platform member without superadmin")
            record(action="member.superadmin.granted", target=member, via="manage.py")
            if uid and not no_claims:
                firebase.set_role_claims(
                    uid=uid, gcip_tenant_id=None, role=Role.SUPERADMIN, tenant_id=None
                )
        self.stdout.write(f"{'Created' if created else 'Kept'} superadmin {member.email}")
