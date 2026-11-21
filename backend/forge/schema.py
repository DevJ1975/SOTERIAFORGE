"""OpenAPI schema generation tweaks (drf-spectacular)."""

from drf_spectacular.openapi import AutoSchema
from rest_framework import serializers


class ForgeAutoSchema(AutoSchema):
    """A model serializer's response always carries every field it declares (a model
    instance has every attribute), so list them all as required. Spectacular otherwise
    copies `required=False` from fields that only have a default for writes, and the
    zod contract test (libs/shared) would treat them as possibly absent.
    """

    def _map_basic_serializer(self, serializer, direction):
        component = super()._map_basic_serializer(serializer, direction)
        if direction == "response" and isinstance(serializer, serializers.ModelSerializer):
            component["required"] = sorted(component.get("properties", {}))
        return component
