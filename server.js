const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'C:\\Program Files\\ffmpeg\\ffmpeg.exe';

const HLS_DIR      = path.join(__dirname, 'hls-temp');
const PLAYLIST_FILE = path.join(__dirname, 'saved-playlist.m3u');
fs.mkdirSync(HLS_DIR, { recursive: true });

function clearHLS() {
  try {
    for (const f of fs.readdirSync(HLS_DIR)) {
      try { fs.unlinkSync(path.join(HLS_DIR, f)); } catch (_) {}
    }
  } catch (_) {}
}
clearHLS(); // clean up any leftovers from a previous run

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve HLS segments with no-cache so the browser always fetches fresh
app.use('/hls', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(HLS_DIR));

let ffmpegProc = null;
let lastPing = null;

// Kill ffmpeg if the browser goes away (no ping for 12 s)
setInterval(() => {
  if (ffmpegProc && lastPing && Date.now() - lastPing > 12000) {
    console.log('Browser disconnected — stopping stream');
    stopStream();
    lastPing = null;
  }
}, 5000);

function stopStream() {
  if (ffmpegProc) {
    ffmpegProc.kill('SIGKILL');
    ffmpegProc = null;
  }
  clearHLS();
}

app.get('/api/playlist', (req, res) => {
  try {
    if (!fs.existsSync(PLAYLIST_FILE)) return res.json({ channels: null });
    const channels = parseM3U(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
    res.json({ channels });
  } catch (_) {
    res.json({ channels: null });
  }
});

app.post('/api/parse-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    const content = await r.text();
    fs.writeFileSync(PLAYLIST_FILE, content, 'utf8');
    res.json({ channels: parseM3U(content) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/parse', (req, res) => {
  try {
    const content = req.body.content || '';
    fs.writeFileSync(PLAYLIST_FILE, content, 'utf8');
    res.json({ channels: parseM3U(content) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/play', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  stopStream();

  const playlist = path.join(HLS_DIR, 'stream.m3u8');
  const segment  = path.join(HLS_DIR, 'seg%03d.ts');

  const args = [
    '-user_agent', 'VLC/3.0.20 LibVLC/3.0.20',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_delay_max', '5',
    '-fflags', '+genpts+discardcorrupt',
    '-i', url,
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_flags', 'delete_segments+omit_endlist',
    '-hls_list_size', '5',
    '-hls_segment_filename', segment,
    playlist,
  ];

  const proc = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  ffmpegProc = proc;

  proc.stderr.on('data', d => process.stderr.write(d));

  proc.on('error', err => {
    console.error('ffmpeg error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    if (ffmpegProc === proc) ffmpegProc = null;
  });

  proc.on('exit', code => {
    console.log('ffmpeg exit:', code);
    if (!res.headersSent) res.status(500).json({ error: `ffmpeg exited (code ${code})` });
    if (ffmpegProc === proc) ffmpegProc = null;
  });

  // Wait until ffmpeg has written the playlist file before telling the client to load
  const deadline = Date.now() + 15000;
  const poll = setInterval(() => {
    if (res.headersSent) return clearInterval(poll);
    if (Date.now() > deadline) {
      clearInterval(poll);
      if (!res.headersSent) res.status(504).json({ error: 'Timeout — ffmpeg produced no HLS output in 15 s' });
      return;
    }
    if (fs.existsSync(playlist)) {
      clearInterval(poll);
      if (!res.headersSent) res.json({ ok: true });
    }
  }, 250);
});

app.post('/api/ping', (req, res) => {
  lastPing = Date.now();
  res.json({ ok: true });
});

app.post('/api/stop', (_req, res) => {
  stopStream();
  res.json({ ok: true });
});

function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const channels = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;
    const info = lines[i];
    const url = lines[i + 1];
    if (!url || url.startsWith('#')) continue;
    channels.push({
      name:  (info.match(/,(.+)$/)               || [])[1]?.trim() || 'Unknown',
      logo:  (info.match(/tvg-logo="([^"]*)"/)    || [])[1] || '',
      group: (info.match(/group-title="([^"]*)"/) || [])[1] || '',
      url,
    });
    i++;
  }
  return channels;
}

process.on('exit',    () => { try { if (ffmpegProc) ffmpegProc.kill('SIGKILL'); } catch (_) {} });
process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`IPTV Remux Player → http://localhost:${PORT}`));
