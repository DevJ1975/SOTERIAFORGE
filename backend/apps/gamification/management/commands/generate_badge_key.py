from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Print a new Ed25519 key for signing badge credentials. Store it as the "
        "BADGE_SIGNING_KEY secret variable on the API service; it is not saved anywhere."
    )

    def handle(self, *args, **options):
        pem = Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        self.stdout.write(pem.decode())
        self.stderr.write(
            "Keep this secret. Replacing the key later makes credentials signed with the old "
            "one fail verification."
        )
