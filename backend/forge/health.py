"""Answer the load balancer's health probe before host and HTTPS checks.

AWS load balancers (and container health checks) probe each task over plain HTTP
with its private IP as the Host header, which ALLOWED_HOSTS would reject as a 400.
"""

from apps.accounts.views import healthz


class HealthCheckMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/healthz":
            return healthz(request)
        return self.get_response(request)
