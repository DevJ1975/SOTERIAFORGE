from drf_spectacular.extensions import OpenApiAuthenticationExtension


class TokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.TokenAuthentication"
    name = "accessToken"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "access token"}
