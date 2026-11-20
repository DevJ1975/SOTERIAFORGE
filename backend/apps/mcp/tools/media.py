"""Media tools: bring a generated file into the organization's private storage.

The assistant never uploads bytes through the model. A media generator (for example
ElevenLabs) returns an https URL; `forge_import_media` has the server fetch it, from
an allowlisted host only, and returns an asset to attach to a lesson.
"""

from typing import Annotated

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from apps.assets import importer, service
from apps.assets.models import Asset

from ..principal import Principal, off_thread, run
from .common import FETCH, READ, author


def register(server: MCPServer) -> None:
    @server.tool(annotations=READ, description="Uploaded files (video, audio, images, documents).")
    async def forge_list_assets(
        search: Annotated[str, Field(max_length=100, description="Part of the file name.")] = "",
    ) -> dict:
        def go(p: Principal):
            assets = Asset.objects.filter(tenant=author(p))
            if search:
                assets = assets.filter(filename__icontains=search)
            return {"assets": [_json(a) for a in assets[:200]]}

        return await run(go)

    @server.tool(
        annotations=FETCH,
        description="Copy a generated media file (audio, video, image, PDF; max 100 MB) from an "
        "https URL on an approved media host into the organization's private storage. Returns "
        "an assetRef to pass to forge_add_lesson or forge_update_lesson. Redirects aren't "
        "followed, so pass the final file URL.",
    )
    async def forge_import_media(
        url: Annotated[str, Field(max_length=2048, description="https:// URL of the file.")],
        filename: Annotated[
            str, Field(max_length=255, description="Name to store it under; default: from the URL.")
        ] = "",
    ) -> dict:
        # Refuse a caller who can't author, or a bad URL, before any network call.
        tenant_id = await run(lambda p: author(p).pk)
        await off_thread(importer.check_url, url)
        stored = await off_thread(importer.fetch, tenant_id, url, filename)
        host = stored.pop("source_host")

        def save(p: Principal):
            asset = service.register(
                tenant=author(p),
                member=p.member,
                action="assets.asset.imported",
                via="mcp",
                sourceHost=host,
                **stored,
            )
            return _json(asset)

        return await run(save)


def _json(asset: Asset) -> dict:
    return {**service.asset_json(asset), "id": str(asset.pk)}
