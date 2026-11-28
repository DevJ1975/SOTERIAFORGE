"""The page an employer opens to check a badge credential.

`verifyUrl` on an exported credential points here. It is public for the same reason
the credential endpoints are (see credential_views.py) and shows only what the
credential itself states. The holder's email is never displayed: a verifier who
already has it can type it in, and the page says whether it matches the salted hash.
"""

import hashlib
import hmac

from django.http import Http404
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.tenants import rls

from . import credentials
from .models import BadgeAward


def email_matches(document: dict, email: str) -> bool:
    identity = document["credentialSubject"]["identifier"][0]
    digest = hashlib.sha256(f"{email.strip().lower()}{identity['salt']}".encode()).hexdigest()
    return hmac.compare_digest(identity["identityHash"], f"sha256${digest}")


# No sign-in, no cookies and nothing is changed, so there is no session for CSRF to protect.
@csrf_exempt
@never_cache
@require_http_methods(["GET", "POST"])
def credential_page(request, award_id):
    with rls.bypass():
        award = (
            BadgeAward.objects.select_related("badge", "tenant", "member")
            .filter(pk=award_id)
            .first()
        )
        if award is None:
            raise Http404("No credential has this address.")
        try:
            document = credentials.credential(award)
            credentials.signing_key()
        except credentials.SigningUnavailable:
            return render(request, "gamification/credential_unavailable.html", status=503)

    context = {
        "name": award.badge.name,
        "description": award.badge.description,
        "is_credential": award.badge.kind == award.badge.Kind.CREDENTIAL,
        "issuer": award.tenant.name,
        "awarded_at": award.awarded_at,
        "criteria": document["credentialSubject"]["achievement"]["criteria"]["narrative"],
        "json_url": document["id"],
        "jwks_url": f"{document['id'].rsplit('/', 1)[0]}/jwks",
        "email": "",
        "match": None,
    }
    if request.method == "POST":
        email = request.POST.get("email", "")[:320]
        context["email"] = email
        context["match"] = bool(email.strip()) and email_matches(document, email)
    return render(request, "gamification/credential.html", context)
