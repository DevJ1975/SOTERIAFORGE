"""Phase 6 dispatch migrations, and the rule that every tenant table ships with RLS."""

import pytest
from django.apps import apps
from django.db import connection
from django.db.migrations.loader import MigrationLoader

from conftest import TEST_APP_ROLE

pytestmark = pytest.mark.django_db

DISPATCH_TABLE = "standards_dispatch"


def _rls_state(table: str):
    with connection.cursor() as cur:
        cur.execute(
            "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = %s",
            [table],
        )
        return cur.fetchone()


def _policy(table: str):
    with connection.cursor() as cur:
        cur.execute(
            "SELECT qual IS NOT NULL, with_check IS NOT NULL FROM pg_policies "
            "WHERE tablename = %s AND policyname = 'tenant_isolation'",
            [table],
        )
        return cur.fetchone()


def test_dispatch_migrations_are_ordered_and_the_rls_one_is_the_leaf():
    graph = MigrationLoader(connection, ignore_no_migrations=True).graph
    assert graph.node_map[("standards", "0008_dispatches_rls")].parents == {
        graph.node_map[("standards", "0007_dispatches")]
    }
    assert {p.key for p in graph.node_map[("standards", "0007_dispatches")].parents} == {
        ("accounts", "0004_drop_firebase"),
        ("learning", "0004_lesson_transcript"),
        ("standards", "0006_sim_scenarios_rls"),
        ("tenants", "0003_drop_firebase"),
    }
    assert ("standards", "0008_dispatches_rls") in graph.leaf_nodes("standards")


def test_dispatch_table_has_forced_rls_and_a_two_sided_policy():
    assert _rls_state(DISPATCH_TABLE) == (True, True)
    assert _policy(DISPATCH_TABLE) == (True, True)


def test_runtime_role_can_use_the_dispatch_table_but_not_bypass_rls():
    with connection.cursor() as cur:
        for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
            cur.execute(
                "SELECT has_table_privilege(%s, %s, %s)", [TEST_APP_ROLE, DISPATCH_TABLE, privilege]
            )
            assert cur.fetchone() == (True,), privilege
        cur.execute(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = %s", [TEST_APP_ROLE]
        )
        assert cur.fetchone() == (False, False)


def _tenant_tables():
    for model in apps.get_models():
        if model._meta.proxy or not model._meta.managed:
            continue
        field = next((f for f in model._meta.concrete_fields if f.name == "tenant"), None)
        if field is not None and field.is_relation:
            yield model._meta.db_table


def test_every_table_with_a_tenant_column_is_isolated_by_rls():
    """Catches the next table that ships without its RLS migration, not only dispatches."""
    tables = sorted(set(_tenant_tables()))
    assert DISPATCH_TABLE in tables
    missing = [t for t in tables if _rls_state(t) != (True, True) or _policy(t) != (True, True)]
    assert missing == []
