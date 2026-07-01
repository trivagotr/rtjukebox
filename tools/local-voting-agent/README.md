# RadioTEDU Local Voting Agent

Separate local agent and browser panel for next-song voting on the RadioTEDU broadcast computer.

## Scope

This repository is independent from `rtjukebox`. It starts the local side of the voting system:

- local song catalog loading
- random 2 or 3 candidate selection
- FFmpeg/ffprobe command helpers
- mock voting round engine
- anti-cheat guardrails for one active vote per user per round
- localhost browser panel using the RadioTEDU mobile color system

The real RadioTEDU backend/mobile integration is intentionally not connected in this MVP. The current API is local and mock-backed so the backend contract can be discussed before wiring it into the mobile app's system.

## Requirements

- Node.js 20+
- npm
- `ffmpeg` and `ffprobe` on PATH for real metadata/playback work

Playback is dry-run by default. The panel shows the FFmpeg command preview after a round resolves.

## Install

```powershell
npm install
```

## Run

```powershell
npm run dev
```

The API listens on `http://127.0.0.1:4317`.

The Vite panel opens at `http://127.0.0.1:5174`.

## Configure

Environment variables:

- `LOCAL_SONG_CATALOG`: JSON catalog path. Default: `data/songs.sample.json`
- `MUSIC_ROOTS`: semicolon-separated allowed music roots. Default: `C:/Music`
- `CANDIDATE_COUNT`: `2` or `3`. Default: `3`
- `FFMPEG_PATH`: FFmpeg executable. Default: `ffmpeg`
- `FFPROBE_PATH`: ffprobe executable. Default: `ffprobe`
- `VOTING_AGENT_PLAYBACK_MODE`: `dry-run` or `live`. Default: `dry-run`
- `PORT`: local API port. Default: `4317`

## Verify

```powershell
npm test
npm run build
```

## Catalog Shape

```json
[
  {
    "id": "song-1",
    "title": "Campus Lights",
    "artist": "RadioTEDU",
    "filePath": "C:/Music/campus-lights.mp3",
    "albumArtPath": "C:/Music/art/campus-lights.jpg",
    "enabled": true
  }
]
```

Only songs inside configured `MUSIC_ROOTS` are eligible.
