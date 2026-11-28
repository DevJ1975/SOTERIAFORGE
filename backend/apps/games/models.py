import uuid

from django.db import models

ENGINES = ["phaser", "pixi", "rive"]
CARD_GAME_KINDS = ["flip_reveal", "match_pairs", "sort_buckets", "scenario_cards"]


class Game(models.Model):
    """An interactive game a lesson can point at (`Lesson.asset_ref` holds its id).

    `config` is the no-code template consumed by the renderer in `libs/games`; the
    admin editor validates it with `validateCardGameConfig` before saving.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.PROTECT)
    title = models.CharField(max_length=300)
    engine = models.CharField(max_length=20, choices=[(e, e) for e in ENGINES], default="phaser")
    config = models.JSONField(default=dict, blank=True)
    asset_refs = models.JSONField(default=list, blank=True)
    rive_asset_ref = models.CharField(max_length=1024, blank=True, default="")
    created_by = models.ForeignKey(
        "accounts.Member", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title", "id"]

    def __str__(self) -> str:
        return self.title
