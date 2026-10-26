"""Postgres row-level security for tenant-owned tables (defense in depth).

Views still filter by tenant; RLS makes a forgotten filter return nothing
instead of another tenant's rows. Policies (see `policy_sql`) read two session
settings:

- `app.tenant_id`: the acting tenant. Rows of other tenants are invisible and
  cannot be written.
- `app.rls_bypass` = 'on': platform-level work (sign-in lookups, superadmin
  platform requests, Django admin, management commands).

With neither set, tenant-owned tables look empty. `RlsMiddleware` restores the
previous values after every request so pooled connections never carry one
request's tenant into the next.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from django.db import connection

TENANT_SETTING = "app.tenant_id"
BYPASS_SETTING = "app.rls_bypass"


def _set(name: str, value: str) -> None:
    with connection.cursor() as cur:
        cur.execute("SELECT set_config(%s, %s, false)", [name, value])


def _get(name: str) -> str:
    with connection.cursor() as cur:
        cur.execute("SELECT current_setting(%s, true)", [name])
        return cur.fetchone()[0] or ""


def set_tenant(tenant_id: str | None) -> None:
    _set(TENANT_SETTING, tenant_id or "")


def set_bypass(on: bool) -> None:
    _set(BYPASS_SETTING, "on" if on else "off")


@contextmanager
def bypass() -> Iterator[None]:
    """Temporarily see every tenant's rows (platform-level lookups only)."""
    previous = _get(BYPASS_SETTING)
    set_bypass(True)
    try:
        yield
    finally:
        _set(BYPASS_SETTING, previous)


@contextmanager
def request_scope() -> Iterator[None]:
    """Start a request with no tenant and no bypass; restore the previous state after."""
    previous = (_get(TENANT_SETTING), _get(BYPASS_SETTING))
    set_tenant(None)
    set_bypass(False)
    try:
        yield
    finally:
        _set(TENANT_SETTING, previous[0])
        _set(BYPASS_SETTING, previous[1])


def policy_sql(table: str) -> tuple[str, str]:
    """(forward, reverse) SQL enabling the tenant policy on `table` (has `tenant_id`)."""
    visible = (
        f"current_setting('{BYPASS_SETTING}', true) = 'on' "
        f"OR tenant_id = nullif(current_setting('{TENANT_SETTING}', true), '')"
    )
    forward = f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON {table} USING ({visible}) WITH CHECK ({visible});
    """
    reverse = f"""
        DROP POLICY IF EXISTS tenant_isolation ON {table};
        ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;
        ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;
    """
    return forward, reverse


class RlsMiddleware:
    """Scopes each request's database session; Django admin staff get bypass."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        with request_scope():
            user = getattr(request, "user", None)
            if request.path.startswith("/admin/") and getattr(user, "is_staff", False):
                set_bypass(True)
            return self.get_response(request)
