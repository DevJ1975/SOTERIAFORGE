#!/usr/bin/env bash
# End-to-end sign-in check: real Firebase Auth emulator tokens -> Django API
# (connected as the RLS-bound runtime role). No mocks.
#
# Prereqs (three terminals, from the repo root):
#   docker compose -f backend/docker-compose.yml up -d --wait
#   npx firebase emulators:start --only auth --project demo-soteria-forge
#   cd backend && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-soteria-forge \
#     uv run --env-file .env python manage.py runserver 127.0.0.1:8000
# Then: backend/scripts/e2e_emulator.sh
# Each run uses fresh users; members from earlier runs stay (audit entries protect them).
set -euo pipefail
EMU=http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1
API=http://127.0.0.1:8000
cd "$(dirname "$0")/.."
export OUTFILE=$(mktemp)
trap 'rm -f "$OUTFILE"' EXIT
curl -s -X DELETE http://127.0.0.1:9099/emulator/v1/projects/demo-soteria-forge/accounts >/dev/null
signup() { curl -s "$EMU/accounts:signUp?key=fake" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"Passw0rd!\",\"returnSecureToken\":true}"; }
field() { python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
RUN=$(date +%s)
ADMIN=$(signup jamil+$RUN@lakewood.example); ADMIN_UID=$(echo $ADMIN | field localId); ADMIN_TOKEN=$(echo $ADMIN | field idToken)
LEARN=$(signup marcus+$RUN@lakewood.example); LEARN_UID=$(echo $LEARN | field localId); LEARN_TOKEN=$(echo $LEARN | field idToken)
OUT=$(signup wile+$RUN@acme.example); OUT_UID=$(echo $OUT | field localId)
DB_USE_OWNER=1 uv run --env-file .env python manage.py shell -c "
from apps.tenants import rls; from apps.tenants.models import Tenant; from apps.accounts.models import Member
with rls.bypass():
    lw,_=Tenant.objects.get_or_create(id='lakewood',defaults=dict(name='Lakewood University',status='active'))
    ac,_=Tenant.objects.get_or_create(id='acme',defaults=dict(name='Acme',status='active'))
    Member.objects.create(tenant=lw,firebase_uid='$ADMIN_UID',email='jamil+$RUN@lakewood.example',role='tenant_admin')
    Member.objects.create(tenant=lw,firebase_uid='$LEARN_UID',email='marcus+$RUN@lakewood.example')
    Member.objects.create(tenant=ac,firebase_uid='$OUT_UID',email='wile+$RUN@acme.example')
" 2>&1 | grep -v "^$" | tail -2
req() { curl -s -o "$OUTFILE" -w "%{http_code}" "$@"; }
echo "1. no token                      -> $(req $API/api/me)"
echo "2. forged token                  -> $(req -H 'Authorization: Bearer not-a-jwt' -H 'X-Forge-Tenant: lakewood' $API/api/me)"
echo "3. real token, lakewood          -> $(req -H "Authorization: Bearer $LEARN_TOKEN" -H 'X-Forge-Tenant: lakewood' $API/api/me)  $(python3 -c "import json,os;d=json.load(open(os.environ['OUTFILE']));print(d['member']['email'],d['member']['role'],d['tenant']['id'])")"
echo "4. real token, wrong tenant      -> $(req -H "Authorization: Bearer $LEARN_TOKEN" -H 'X-Forge-Tenant: acme' $API/api/me)"
echo "5. admin lists members           -> $(req -H "Authorization: Bearer $ADMIN_TOKEN" -H 'X-Forge-Tenant: lakewood' $API/api/members)  $(python3 -c "import json,os;e=[m['email'] for m in json.load(open(os.environ['OUTFILE']))];print('lakewood only:', all(x.endswith('@lakewood.example') for x in e), '| this run:', sorted(x for x in e if '+$RUN@' in x))")"
MID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" -H 'X-Forge-Tenant: lakewood' $API/api/members | python3 -c "import sys,json;print([m['id'] for m in json.load(sys.stdin) if m['email'] == 'marcus+$RUN@lakewood.example'][0])")
echo "6. learner tries role change     -> $(req -X PATCH -H "Authorization: Bearer $LEARN_TOKEN" -H 'X-Forge-Tenant: lakewood' -H 'content-type: application/json' -d '{"role":"tenant_admin"}' $API/api/members/$MID/role)"
echo "7. admin promotes learner        -> $(req -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'X-Forge-Tenant: lakewood' -H 'content-type: application/json' -d '{"role":"instructor"}' $API/api/members/$MID/role)"
CLAIMS=$(curl -s "$EMU/accounts:lookup?key=fake" -H 'content-type: application/json' -d "{\"idToken\":\"$LEARN_TOKEN\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['users'][0].get('customAttributes'))")
echo "8. claims mirrored in Firebase   -> $CLAIMS"
DB_USE_OWNER=1 uv run --env-file .env python manage.py shell -c "
from apps.tenants import rls; from apps.audit.models import AuditEntry
with rls.bypass():
    e=AuditEntry.objects.filter(action='member.role.set').latest('created_at'); print('9. audit entry                   ->', e.action, e.tenant_id, e.details)
" 2>&1 | grep "9\."
DIS=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-soteria-forge/accounts:update" -H 'Authorization: Bearer owner' -H 'content-type: application/json' -d "{\"localId\":\"$LEARN_UID\",\"disableUser\":true}" -o /dev/null -w "%{http_code}")
echo "10. disabled user's token        -> $(req -H "Authorization: Bearer $LEARN_TOKEN" -H 'X-Forge-Tenant: lakewood' $API/api/me)  (disable call: $DIS)"
