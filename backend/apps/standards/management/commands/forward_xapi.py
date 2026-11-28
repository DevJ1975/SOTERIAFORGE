import json
import logging
from datetime import timedelta
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.standards.models import Statement
from apps.tenants.rls import bypass

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Deliver up to 50 due outbox statements to the configured existing xAPI 1.0.3 LRS."

    def handle(self, *args, **options):
        url = urlsplit(settings.XAPI_LRS_ENDPOINT)
        if (
            url.scheme != "https"
            or not url.netloc
            or url.username
            or url.password
            or url.query
            or url.fragment
            or not settings.XAPI_LRS_AUTH
        ):
            raise CommandError("Set the HTTPS XAPI_LRS_ENDPOINT and secret XAPI_LRS_AUTH first.")
        endpoint = settings.XAPI_LRS_ENDPOINT.rstrip("/") + "/statements"
        with bypass(), requests.Session() as session:
            for _ in range(50):
                # Row lock prevents simultaneous workers sending conflicting copies.
                with transaction.atomic():
                    statement = (
                        Statement.objects.select_for_update(skip_locked=True)
                        .filter(delivered_at__isnull=True, next_attempt_at__lte=timezone.now())
                        .order_by("created_at")
                        .first()
                    )
                    if statement is None:
                        break
                    statement.attempts += 1
                    try:
                        response = session.put(
                            endpoint,
                            params={"statementId": str(statement.pk)},
                            headers={
                                "Authorization": settings.XAPI_LRS_AUTH,
                                "X-Experience-API-Version": "1.0.3",
                                "Content-Type": "application/json",
                            },
                            data=json.dumps(statement.payload, allow_nan=False).encode(),
                            timeout=(5, 20),
                            allow_redirects=False,
                            stream=True,
                        )
                        with response:
                            if response.status_code != 204:
                                statement.last_error = f"LRS HTTP {response.status_code}"
                            else:
                                statement.last_error = ""
                                statement.delivered_at = timezone.now()
                    except requests.RequestException as error:
                        statement.last_error = f"LRS transport: {type(error).__name__}"
                    if statement.last_error:
                        logger.error(
                            "xAPI delivery %s failed: %s", statement.pk, statement.last_error
                        )
                    statement.next_attempt_at = timezone.now() + timedelta(
                        seconds=min(3600, 30 * 2 ** min(statement.attempts, 7))
                    )
                    statement.save(
                        update_fields=[
                            "attempts",
                            "delivered_at",
                            "next_attempt_at",
                            "last_error",
                        ]
                    )
        self.stdout.write("xAPI delivery pass complete.")
