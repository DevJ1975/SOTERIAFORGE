import json

from rest_framework import serializers

from .models import CARD_GAME_KINDS, Game

MAX_CONFIG_BYTES = 100_000


class GameSerializer(serializers.ModelSerializer):
    tenantId = serializers.CharField(source="tenant_id", read_only=True)
    assetRefs = serializers.ListField(
        source="asset_refs",
        child=serializers.CharField(max_length=1024),
        max_length=50,
        required=False,
    )
    riveAssetRef = serializers.CharField(
        source="rive_asset_ref", max_length=1024, required=False, allow_blank=True
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Game
        fields = [
            "id",
            "tenantId",
            "title",
            "engine",
            "config",
            "assetRefs",
            "riveAssetRef",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "tenantId", "createdAt", "updatedAt"]

    def validate_config(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Config must be an object.")
        if len(json.dumps(value).encode()) > MAX_CONFIG_BYTES:
            raise serializers.ValidationError("Config is larger than 100 KB.")
        kind = value.get("kind")
        if kind is not None and kind not in CARD_GAME_KINDS:
            raise serializers.ValidationError(f"Unknown card game kind {kind!r}.")
        return value
