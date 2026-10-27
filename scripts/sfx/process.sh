#!/usr/bin/env bash
# Turns raw ElevenLabs downloads into the shipped sound library.
#   usage: scripts/sfx/process.sh <raw-dir> [out-dir]
# <raw-dir> holds <id>.mp3 for every id in manifest.json. Needs ffmpeg, jq.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
manifest="$here/manifest.json"
raw="${1:?raw dir with <id>.mp3 files}"
out="${2:-$here/../../libs/sfx/assets}"
lufs="$(jq -r .targetLufs "$manifest")"
max_bytes="$(jq -r .maxBytesPerFile "$manifest")"
fade=0.08

mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
status=0
while IFS=$'\t' read -r id max; do
  src="$raw/$id.mp3"
  [[ -f "$src" ]] || { echo "missing raw: $id" >&2; status=1; continue; }
  # Pass 1: drop leading silence and cap the length. The tail fade needs the
  # trimmed length, so measure it before filtering again.
  trimmed="$tmp/$id.wav"
  ffmpeg -v error -y -i "$src" -af "silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:$max" "$trimmed"
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$trimmed")"
  start="$(awk -v d="$dur" -v f="$fade" 'BEGIN{s=d-f; if(s<0)s=0; printf "%.3f", s}')"
  # Pass 2: fade the tail, level to the target loudness, then hard-limit at
  # about -3 dBFS. Single-pass loudnorm overshoots on very short clips and the
  # MP3 encoder adds up to ~1 dB more, so the limiter leaves that headroom.
  filter="afade=t=out:st=$start:d=$fade,loudnorm=I=$lufs:TP=-2:LRA=7,aresample=44100,alimiter=limit=0.7:level=disabled"
  src="$trimmed"
  ffmpeg -v error -y -i "$src" -af "$filter" -ar 44100 -ac 1 -c:a libmp3lame -q:a 4 "$out/$id.mp3"
  size="$(wc -c <"$out/$id.mp3")"
  if (( size > max_bytes )); then echo "over budget: $id.mp3 is $size bytes" >&2; status=1; fi
done < <(jq -r '.sounds[] | [.id, .maxSeconds] | @tsv' "$manifest")

exit $status
