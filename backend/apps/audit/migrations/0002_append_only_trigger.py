from django.db import migrations

FORBID = """
CREATE FUNCTION audit_auditentry_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_auditentry is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_auditentry_append_only
  BEFORE UPDATE OR DELETE ON audit_auditentry
  FOR EACH ROW EXECUTE FUNCTION audit_auditentry_append_only();
"""

ALLOW = """
DROP TRIGGER IF EXISTS audit_auditentry_append_only ON audit_auditentry;
DROP FUNCTION IF EXISTS audit_auditentry_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunSQL(FORBID, ALLOW)]
