from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Member, Role
from apps.audit.models import record
from apps.tenants import rls


class Command(BaseCommand):
    help = (
        "Grant platform superadmin (out-of-band by design). Then set a password with "
        "`manage.py set_member_password --email ...`."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)

    def handle(self, *args, email, **options):
        email = email.strip().lower()
        with transaction.atomic(), rls.bypass():
            member = Member.objects.filter(tenant__isnull=True, email__iexact=email).first()
            created = member is None
            if created:
                member = Member.objects.create(
                    tenant=None,
                    email=email,
                    role=Role.SUPERADMIN,
                    status=Member.Status.ACTIVE,
                )
            elif member.role != Role.SUPERADMIN:
                raise CommandError(f"{email} is a platform member without superadmin")
            record(action="member.superadmin.granted", target=member, via="manage.py")
        self.stdout.write(f"{'Created' if created else 'Kept'} superadmin {member.email}")
