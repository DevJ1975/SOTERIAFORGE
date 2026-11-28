from django.contrib.auth import logout
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme, urlencode
from oauth2_provider.views import AuthorizationView

from apps.tenants import rls

from .principal import resolve


class ForgeAuthorizationView(AuthorizationView):
    """The OAuth consent step, showing which Forge membership the AI app will act as."""

    def dispatch(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            with rls.bypass():
                self.forge = resolve(request.user.get_username())
            if self.forge is None:  # not a Forge sign-in, or the membership has ended
                return logout_view(request)
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        member, tenant = self.forge
        return super().get_context_data(forge_member=member, forge_tenant=tenant, **kwargs)


def logout_view(request: HttpRequest) -> HttpResponse:
    """End the browser's sign-in session and start over (OAuth tokens are unaffected)."""
    next_url = request.GET.get("next") or request.get_full_path()
    logout(request)
    if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
        next_url = "/"
    return redirect(f"{reverse('mcp-login')}?{urlencode({'next': next_url})}")
