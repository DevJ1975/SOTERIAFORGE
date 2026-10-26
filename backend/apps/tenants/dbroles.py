"""The runtime database role.

Postgres superusers (and roles with BYPASSRLS) skip row-level security even when
it is FORCEd, and Railway's default `postgres` user is a superuser. So the web
process connects as `forge_app`: no superuser, no BYPASSRLS, DML only, and
append-only on the audit log. Migrations keep using the owner (DB_USE_OWNER=1).
"""

from django.db import connection
from psycopg import sql

APP_ROLE = "forge_app"
APPEND_ONLY_TABLES = ("audit_auditentry",)


def ensure_app_role(role: str = APP_ROLE, password: str | None = None) -> None:
    """Create or update the runtime role and (re)grant its privileges. Idempotent.

    Run as the database owner after every migrate so new tables are covered.
    Without a password the role can't log in (tests use it via SET ROLE).
    """
    ident = sql.Identifier(role)
    login = (
        sql.SQL("LOGIN PASSWORD {}").format(sql.Literal(password))
        if password
        else sql.SQL("NOLOGIN")
    )
    attrs = sql.SQL("NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT {}").format(login)
    statements = [
        sql.SQL(
            "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = {name}) "
            "THEN CREATE ROLE {ident}; END IF; END $$"
        ).format(name=sql.Literal(role), ident=ident),
        sql.SQL("ALTER ROLE {} {}").format(ident, attrs),
        sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
            sql.Identifier(connection.settings_dict["NAME"]), ident
        ),
        sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(ident),
        sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}").format(
            ident
        ),
        sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(ident),
    ]
    for table in APPEND_ONLY_TABLES:
        statements.append(
            sql.SQL("REVOKE UPDATE, DELETE, TRUNCATE ON {} FROM {}").format(
                sql.Identifier(table), ident
            )
        )
    with connection.cursor() as cur:
        raw = cur.connection  # psycopg connection, for client-side composition
        for stmt in statements:
            cur.execute(stmt.as_string(raw))


def use_app_role(role: str = APP_ROLE) -> None:
    """Switch this session to the runtime role (tests; reverts with the transaction)."""
    with connection.cursor() as cur:
        cur.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)).as_string(cur.connection))
