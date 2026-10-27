"""Firebase Admin, used for identity only: verifying ID tokens and mirroring
role claims so the Angular route guards keep working during the migration."""

import json
from functools import cache

import firebase_admin
from django.conf import settings
from firebase_admin import auth, credentials, tenant_mgt


@cache
def _app() -> firebase_admin.App:
    options = {"projectId": settings.FIREBASE_PROJECT_ID} if settings.FIREBASE_PROJECT_ID else None
    if settings.FIREBASE_CREDENTIALS_JSON:
        cred = credentials.Certificate(json.loads(settings.FIREBASE_CREDENTIALS_JSON))
    else:
        cred = credentials.ApplicationDefault()
    return firebase_admin.initialize_app(cred, options, name="forge")


def _client(gcip_tenant_id: str | None) -> auth.Client:
    if gcip_tenant_id:
        return tenant_mgt.auth_for_tenant(gcip_tenant_id, app=_app())
    return auth.Client(_app())


def verify_id_token(token: str) -> dict:
    """Verify signature, expiry, audience and revocation. Raises on any failure.

    The project-level check accepts tokens from any GCIP tenant but looks users up
    in the project pool, so revocation is re-checked with the token's own tenant
    client (which also rejects a tenant mismatch).
    """
    claims = auth.verify_id_token(token, app=_app())
    tenant = claims.get("firebase", {}).get("tenant")
    return _client(tenant).verify_id_token(token, check_revoked=True)


def set_role_claims(
    *, uid: str, gcip_tenant_id: str | None, role: str, tenant_id: str | None
) -> None:
    """Mirror role/tenant into custom claims, keeping other claims (e.g. B2C entitlements).

    Interim: the Angular guards still read claims. Once they read `/api/me`, this
    and the role claim can go (plan §2: only `tenantId` stays a claim).
    """
    client = _client(gcip_tenant_id)
    existing = client.get_user(uid).custom_claims or {}
    claims = {**existing, "role": role}
    if tenant_id is None:
        claims.pop("tenantId", None)
    else:
        claims["tenantId"] = tenant_id
    if gcip_tenant_id:
        claims["gcipTenantId"] = gcip_tenant_id
    client.set_custom_user_claims(uid, claims)
