from django.apps import AppConfig


class StandardsConfig(AppConfig):
    name = "apps.standards"

    def ready(self):
        from corsheaders.signals import check_request_enabled

        from .cmi5 import AU_PATHS

        def allow_assignable_units(sender, request, **kwargs):
            # An AU is served from its own origin and authenticates with a token it
            # sends explicitly (never a cookie), so any origin may call these paths.
            return request.path.startswith(AU_PATHS)

        check_request_enabled.connect(allow_assignable_units, weak=False)
