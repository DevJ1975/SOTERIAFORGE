"""Delete coach questions and answers older than the retention period.

Run it daily (cron worker or one-off task). It runs as the database owner, like the
other management commands, and covers every tenant.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.coach.models import Exchange
from apps.tenants import rls


class Command(BaseCommand):
    help = "Delete coach exchanges older than COACH_LOG_RETENTION_DAYS."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=settings.COACH_LOG_RETENTION_DAYS)

    def handle(self, *args, days, **options):
        cutoff = timezone.now() - timedelta(days=max(0, days))
        with rls.bypass():
            deleted, _ = Exchange.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"Deleted {deleted} coach exchanges older than {days} days")
