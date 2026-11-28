from rest_framework.test import APIClient

from apps.tenants.models import Tenant


def branding(tenant: str | None):
    client = APIClient()
    headers = {"HTTP_X_FORGE_TENANT": tenant} if tenant else {}
    return client.get("/api/tenant/branding", **headers)


def test_active_tenant_branding_is_public_and_minimal(acme):
    acme.branding = {"primaryColor": "#0b5fff", "logoUrl": "https://cdn.example/acme.svg"}
    acme.save()
    res = branding("acme")
    assert res.status_code == 200
    assert res.data == {
        "id": "acme",
        "name": "Acme",
        "branding": {"primaryColor": "#0b5fff", "logoUrl": "https://cdn.example/acme.svg"},
    }
    assert "max-age=300" in res["Cache-Control"]


def test_unknown_missing_and_inactive_tenants_look_the_same(acme):
    Tenant.objects.create(id="paused", name="Paused", status=Tenant.Status.SUSPENDED)
    assert branding("nope").status_code == 404
    assert branding(None).status_code == 404
    assert branding("paused").status_code == 404
