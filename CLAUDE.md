# IPTV Remux Player

Web-based IPTV player that uses ffmpeg to remux live IPTV streams into HLS for browser playback.

## Stack

- **Backend**: Node.js + Express (`server.js`, port 3000)
- **Frontend**: Single-file vanilla JS app (`public/index.html`) — all HTML, CSS, and JS in one file
- **HLS playback**: hls.js (loaded from CDN)
- **ffmpeg**: Required externally; default path `C:\Program Files\ffmpeg\ffmpeg.exe` (override with `FFMPEG_PATH` env var)

## How to run

```
npm start
```

Opens at `http://localhost:3000`.

## How it works

1. User loads an M3U playlist via file upload, drag-and-drop, or URL
2. Server parses M3U and saves it to `saved-playlist.m3u` (auto-loaded on next startup)
3. User clicks a channel → server spawns ffmpeg to remux the stream to HLS segments in `hls-temp/`
4. Browser plays back via hls.js from `/hls/stream.m3u8`
5. Browser sends a heartbeat ping every 5s; ffmpeg is killed if no ping for 12s or on page unload

## Key files

- `server.js` — Express server, ffmpeg process management, M3U parsing, all API routes
- `public/index.html` — entire frontend (upload screen + player screen with sidebar, search, video, now-playing bar)
- `saved-playlist.m3u` — last loaded playlist, persisted across restarts
- `hls-temp/` — transient HLS segments/playlist, cleared on server start
- `scripts/install-ffmpeg.js` — ffmpeg install helper script

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/playlist` | Load saved playlist |
| POST | `/api/parse-url` | Fetch + parse M3U from a URL |
| POST | `/api/parse` | Parse uploaded M3U content |
| POST | `/api/play` | Start ffmpeg remux for a channel URL |
| POST | `/api/ping` | Heartbeat (keeps stream alive) |
| POST | `/api/stop` | Stop current ffmpeg stream |

## ffmpeg invocation

Remuxes with `-c copy` (no re-encode) to HLS with 2s segments, sliding 5-segment window, `delete_segments+omit_endlist` flags. Waits up to 15s for `stream.m3u8` to appear before responding to `/api/play`.

## Docker

A Docker setup was added (commit `ddc2366`). Check for a `Dockerfile` if deploying containerized.
