import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.standards import storage
from apps.standards.models import Package
from apps.standards.packages import MAX_ZIP, InvalidPackage, extract_isolated
from apps.tenants.rls import bypass

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Process up to 5 pending SCORM packages in isolated child processes (run periodically)."

    def handle(self, *args, **options):
        with bypass():
            # Recover a killed worker without reprocessing ready/archived packages.
            Package.objects.filter(
                status=Package.Status.PROCESSING,
                updated_at__lt=timezone.now() - timedelta(minutes=10),
            ).update(
                status=Package.Status.FAILED, error="Worker interrupted; upload a new version."
            )
            for _ in range(5):
                with transaction.atomic():
                    package = (
                        Package.objects.select_for_update(skip_locked=True)
                        .filter(status=Package.Status.PENDING)
                        .first()
                    )
                    if package is None:
                        break
                    package.status = Package.Status.PROCESSING
                    package.save(update_fields=["status", "updated_at"])
                try:
                    raw = storage.get(
                        storage.key_for(package.tenant_id, package.pk, "upload.zip"), limit=MAX_ZIP
                    )
                    with extract_isolated(raw) as (metadata, directory):
                        if metadata["sha256"] != package.sha256:
                            raise InvalidPackage("Uploaded package checksum mismatch.")
                        for name in metadata["files"]:
                            storage.put(
                                storage.key_for(package.tenant_id, package.pk, f"files/{name}"),
                                (directory / name).read_bytes(),
                            )
                            Package.objects.filter(pk=package.pk).update(updated_at=timezone.now())
                    package.files = metadata["files"]
                    package.scorm_version = metadata["version"]
                    package.launch_path = metadata["launch"]
                    package.status = Package.Status.READY
                    package.error = ""
                except (InvalidPackage, storage.StorageUnavailable) as error:
                    logger.error("SCORM package %s failed: %s", package.pk, type(error).__name__)
                    package.status = Package.Status.FAILED
                    package.error = (
                        str(error)
                        if isinstance(error, InvalidPackage)
                        else "Package storage failed."
                    )
                Package.objects.filter(pk=package.pk, status=Package.Status.PROCESSING).update(
                    files=package.files,
                    scorm_version=package.scorm_version,
                    launch_path=package.launch_path,
                    status=package.status,
                    error=package.error,
                    updated_at=timezone.now(),
                )
                self.stdout.write(f"{package.pk}: {package.status}")
