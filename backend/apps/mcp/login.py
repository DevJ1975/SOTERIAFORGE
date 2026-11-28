"""Sign-in for the OAuth authorize step: the same email + password check as the API.

A successful sign-in gives the browser a Django session for the shadow OAuth user of
that membership (apps/mcp/principal.py). Failed attempts count toward the same
lockout as `/api/auth/login`.
"""

from django.conf import settings
from django.contrib.auth import login
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods

from apps.accounts.auth_views import BAD_LOGIN, verify_password
from apps.accounts.models import Member
from apps.tenants import rls
from apps.tenants.models import Tenant

from .principal import user_for


class _SignInError(Exception):
    pass


@require_http_methods(["GET", "POST"])
def login_view(request: HttpRequest) -> HttpResponse:
    next_url = request.POST.get("next") or request.GET.get("next") or ""
    org = (request.POST.get("org") or request.GET.get("org") or "").strip().lower()
    email = request.POST.get("email", "").strip()
    error = ""
    if request.method == "POST":
        try:
            member, tenant = _sign_in(email, request.POST.get("password", ""), org)
        except _SignInError as exc:
            error = str(exc)
        else:
            login(request, user_for(member, tenant), backend=settings.AUTHENTICATION_BACKENDS[0])
            if not url_has_allowed_host_and_scheme(
                next_url, allowed_hosts={request.get_host()}, require_https=request.is_secure()
            ):
                next_url = "/"
            return redirect(next_url)
    status = 200 if not error else 401
    return render(
        request,
        "mcp/login.html",
        {"next": next_url, "org": org, "email": email, "error": error},
        status=status,
    )


def _sign_in(email: str, password: str, org: str) -> tuple[Member, Tenant | None]:
    if not email or not password:
        raise _SignInError("Enter your email and password.")
    member, locked_for = verify_password(email, org, password)
    if locked_for:
        raise _SignInError("Too many failed attempts. Try again later.")
    if member is None:
        raise _SignInError(BAD_LOGIN)
    if member.tenant_id is not None:
        tenant = member.tenant
    elif org:  # a platform admin acting inside an organization
        with rls.bypass():
            tenant = Tenant.objects.filter(pk=org).first()
    else:
        tenant = None
    if tenant is not None and tenant.status != Tenant.Status.ACTIVE:
        raise _SignInError("This organization isn't active.")
    return member, tenant
