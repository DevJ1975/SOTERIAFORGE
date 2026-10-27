# sfx

Curated courseware sound effects, generated with ElevenLabs (`eleven_text_to_sound_v2`) and shipped as static files in `assets/`. No runtime ElevenLabs dependency.

`scripts/sfx/manifest.json` is the source of truth: each sound has an id, where it is used, a max length, and the generation prompt.

## Regenerating

1. Generate each manifest prompt as a sound effect (ElevenLabs app, API, or the MCP connector) and save the result as `<id>.mp3` in a scratch folder.
2. Run `scripts/sfx/process.sh <scratch-folder>`. It trims leading silence, caps each clip at its `maxSeconds`, fades the tail, normalizes to the manifest's `targetLufs`, limits peaks to about -3 dBFS, and writes mono 44.1 kHz MP3s to `libs/sfx/assets/`. It fails if any file exceeds `maxBytesPerFile`.
3. Listen to the results before committing. Loudness is measured on very short clips, so levels vary by a few LU; adjust by ear.

Needs `ffmpeg` (with `libmp3lame`) and `jq`.
