from django.db import migrations

from apps.tenants.rls import policy_sql

TABLES = [
    "gamification_xpevent",
    "gamification_activityday",
    "gamification_cohort",
    "gamification_section",
    "gamification_crew",
    "gamification_crewmembership",
]

# The XP ledger is append-only, like the audit log: even the table owner can't
# rewrite history through UPDATE or DELETE (the runtime role is also denied them).
FORBID = """
CREATE FUNCTION gamification_xpevent_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'gamification_xpevent is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gamification_xpevent_append_only
  BEFORE UPDATE OR DELETE ON gamification_xpevent
  FOR EACH ROW EXECUTE FUNCTION gamification_xpevent_append_only();
"""

ALLOW = """
DROP TRIGGER IF EXISTS gamification_xpevent_append_only ON gamification_xpevent;
DROP FUNCTION IF EXISTS gamification_xpevent_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("gamification", "0001_initial")]
    operations = [migrations.RunSQL(*policy_sql(table)) for table in TABLES] + [
        migrations.RunSQL(FORBID, ALLOW)
    ]
