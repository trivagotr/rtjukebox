# RadioTEDU Local Voting Agent

Separate local agent and browser panel for next-song voting on the RadioTEDU broadcast computer.

## Scope

This repository is independent from `rtjukebox`. It starts the local side of the voting system:

- local plain-folder music database scanning
- nearby album cover discovery
- separate jingle folder scanning
- random 2 or 3 candidate selection
- FFmpeg/ffprobe command helpers
- mock voting round engine
- anti-cheat guardrails for one active vote per user per round
- localhost browser panel using the RadioTEDU mobile color system

Backend sync is optional and disabled unless backend agent credentials are provided. The local panel and API still work in dry-run mode without a server.

## Requirements

- Node.js 20+
- npm
- `ffmpeg` and `ffprobe` on PATH for real metadata/playback work

Playback is dry-run by default. The panel shows the FFmpeg command preview after a round resolves; when `JINGLE_BEFORE_WINNER=true`, the preview includes a jingle before the winning song.

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

- `MUSIC_LIBRARY_DIR`: semicolon-separated plain folder database roots. Default: `C:/Music`
- `MUSIC_ROOTS`: legacy alias for `MUSIC_LIBRARY_DIR`
- `LOCAL_SONG_CATALOG`: optional JSON catalog path. If set, JSON catalog mode is used instead of folder scanning.
- `JINGLE_LIBRARY_DIR`: semicolon-separated jingle folder roots. Default: empty
- `JINGLE_ROOTS`: legacy alias for `JINGLE_LIBRARY_DIR`
- `JINGLE_BEFORE_WINNER`: `true` to preview/play a jingle before the winning song. Default: disabled
- `CANDIDATE_COUNT`: `2` or `3`. Default: `3`
- `FFMPEG_PATH`: FFmpeg executable. Default: `ffmpeg`
- `FFPROBE_PATH`: ffprobe executable. Default: `ffprobe`
- `VOTING_AGENT_PLAYBACK_MODE`: `dry-run` or `live`. Default: `dry-run`
- `PORT`: local API port. Default: `4317`
- `BACKEND_API_BASE_URL`: backend origin/base URL for agent sync
- `BACKEND_AGENT_TOKEN`: device-scoped backend token
- `BACKEND_DEVICE_ID`: backend device id for the broadcast computer
- `BACKEND_SYNC_ENABLED`: set to `false` to disable sync even when credentials exist

## Verify

```powershell
npm test
npm run build
```

## Folder Database

Set `MUSIC_LIBRARY_DIR` to a folder containing audio files. Subfolders are allowed. Supported audio extensions:

- `.aac`
- `.flac`
- `.m4a`
- `.mp3`
- `.ogg`
- `.wav`

Album art is discovered from the same folder as the song. The scanner looks for `<song-name>.jpg/.png/.webp` first, then `cover`, `folder`, `front`, or `album` image files.

Set `JINGLE_LIBRARY_DIR` to a separate folder for jingles. Jingles are never included as voting candidates; they are only used in the playback plan.

## Optional JSON Catalog

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

Only songs inside configured `MUSIC_LIBRARY_DIR` / `MUSIC_ROOTS` are eligible.
