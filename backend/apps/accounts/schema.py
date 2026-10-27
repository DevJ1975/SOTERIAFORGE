from drf_spectacular.extensions import OpenApiAuthenticationExtension


class FirebaseScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.FirebaseAuthentication"
    name = "firebaseIdToken"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "Firebase ID token"}
