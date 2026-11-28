import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts import tokens
from apps.accounts.models import Member
from apps.audit.models import record
from apps.tenants import rls


class Command(BaseCommand):
    help = "Set a member's password (prompts for it; ends their other sessions)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--tenant", help="Tenant id; omit for a superadmin")

    def handle(self, *args, email, tenant, **options):
        with rls.bypass():
            qs = Member.objects.filter(email__iexact=email.strip())
            member = (
                qs.filter(tenant_id=tenant) if tenant else qs.filter(tenant__isnull=True)
            ).first()
            if member is None:
                raise CommandError("No such member")
            password = getpass.getpass("New password: ")
            if password != getpass.getpass("Again: "):
                raise CommandError("Passwords don't match")
            try:
                validate_password(password, user=member)
            except ValidationError as exc:
                raise CommandError(" ".join(exc.messages)) from exc
            with transaction.atomic():
                member.set_password(password)
                if member.status == Member.Status.INVITED:
                    member.status = Member.Status.ACTIVE
                member.save()
                tokens.revoke_all(member)
                record(action="auth.password.set", target=member, via="manage.py")
        self.stdout.write(f"Password set for {member.email}")
