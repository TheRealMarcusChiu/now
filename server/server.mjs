// Life Tracker — single-file, zero-dependency Node server.
// Run:  node server/server.mjs   (from the repo root)
//
// What it does:
//   POST /log     — accepts one event (or an array). Stamps ts if missing.
//                   Appends to data/days/YYYY-MM-DD.jsonl AND .js (append-only,
//                   never rewrites) and keeps data/manifest.json up to date.
//   POST /upload  — accepts {kind, ext, dataBase64, caption?, ts?, lat?, lng?}.
//                   Writes the media file to media/ and appends a matching event.
//   GET  /events  — returns the full log as JSONL (all day files concatenated).
//   GET  /*       — serves the static site (index.html, data/, media/) so you can
//                   preview at http://127.0.0.1:8787 exactly as GitHub Pages will serve it.
//
// Legacy: if a monolithic data/events.jsonl still exists at startup, the server
// runs the migration (server/migrate-days.mjs) automatically — it's idempotent,
// so restarts are always safe.
//
// After the server appends, it auto-commits and pushes in batches: the first
// log update arms a timer and every update within the window rides the same
// commit, which fires ~10 min later. Disable with GIT_SYNC=off, tune with
// GIT_BATCH_SECS=60. Requires the repo to have a remote + stored credentials
// (test once with a manual `git push`).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrateDays } from './migrate-days.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const MEDIA = path.join(ROOT, 'media');
const DAYS = path.join(DATA, 'days');
const MANIFEST = path.join(DATA, 'manifest.json');
const MANIFEST_JS = path.join(DATA, 'manifest.js');
const LEGACY_JSONL = path.join(DATA, 'events.jsonl');
const PORT = process.env.PORT || 8787;

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(DAYS, { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });

// fold any legacy monolith into per-day files before serving (idempotent no-op otherwise)
let migratedAtBoot = false;
try {
  const m = migrateDays({ log: (...a) => console.log('[migrate]', ...a) });
  migratedAtBoot = !m.skipped;
} catch (err) {
  console.error('[migrate] failed — fix data/ before events can be logged:', err.message);
  process.exit(1);
}

// ---- per-day log files + manifest ----
function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).days || []; } catch { return []; }
}
function saveManifest(days) {
  fs.writeFileSync(MANIFEST, JSON.stringify({ days }, null, 2) + '\n');
  fs.writeFileSync(MANIFEST_JS,
    '// AUTO-GENERATED list of per-day log files under data/days/.\n' +
    'window.__DAY_MANIFEST = ' + JSON.stringify(days) + ';\n');
}
function dayOf(ts) {
  const d = String(ts).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : 'undated';
}

// 'revision' = append-only edit from the website's admin mode: {type:'revision', target:'<ts>|<type>', data:{…}}
// 'deletion' = append-only delete: {type:'deletion', target:'<ts>|<type>'} — the site hides the target on load
const ALLOWED_TYPES = new Set(['web', 'youtube', 'music', 'git', 'health', 'screen', 'place', 'photo', 'audio', 'video', 'note', 'revision', 'deletion']);

// ---- git auto-sync (commit + push after every append, debounced) ----
const GIT_SYNC = process.env.GIT_SYNC !== 'off';
const GIT_BATCH_MS = Number(process.env.GIT_BATCH_SECS || 600) * 1000; // batch log updates into one commit every 10 min
let gitTimer = null, gitBusy = false, gitAgain = false;

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout));
  });
}

function scheduleGitSync() {
  if (!GIT_SYNC) return;
  if (gitTimer) return; // a batch is already pending — this update rides it
  gitTimer = setTimeout(() => { gitTimer = null; runGitSync(); }, GIT_BATCH_MS);
}

async function runGitSync() {
  if (gitBusy) { gitAgain = true; return; }
  gitBusy = true;
  try {
    await git(['add', 'data', 'media']);
    const staged = await git(['status', '--porcelain', 'data', 'media']);
    if (staged.trim()) {
      await git(['commit', '-m', 'log: ' + new Date().toISOString()]);
      await git(['push']);
      console.log('[git] committed & pushed');
    }
  } catch (err) {
    console.warn('[git] sync failed (will retry on next log):', err.message);
  } finally {
    gitBusy = false;
    if (gitAgain) { gitAgain = false; scheduleGitSync(); }
  }
}

function appendEvents(events) {
  const clean = [];
  for (const raw of events) {
    if (!raw || typeof raw !== 'object' || !raw.type) continue;
    if (!ALLOWED_TYPES.has(raw.type)) continue;
    const e = { ...raw };
    if (!e.ts) e.ts = new Date().toISOString(); // date always prefilled
    clean.push(e);
  }
  if (!clean.length) return 0;
  // Append-only: group by day, two synchronized appends per day, never a rewrite.
  const byDay = new Map();
  for (const e of clean) {
    const d = dayOf(e.ts);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }
  let days = loadManifest();
  let manifestDirty = false;
  for (const [d, evs] of byDay) {
    fs.appendFileSync(path.join(DAYS, d + '.jsonl'), evs.map(e => JSON.stringify(e)).join('\n') + '\n');
    fs.appendFileSync(path.join(DAYS, d + '.js'), evs.map(e => '__logEvent(' + JSON.stringify(e) + ');').join('\n') + '\n');
    if (!days.includes(d)) { days.push(d); manifestDirty = true; }
  }
  if (manifestDirty) saveManifest(days.sort());
  scheduleGitSync();
  return clean.length;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jsonl': 'application/x-ndjson', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.ico': 'image/x-icon',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req, limitMb = 50) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limitMb * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const SAFE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'wav', 'mp3', 'm4a']);

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');

  try {
    if (req.method === 'POST' && url.pathname === '/log') {
      const body = JSON.parse((await readBody(req, 5)).toString('utf8') || '{}');
      const n = appendEvents(Array.isArray(body) ? body : [body]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, appended: n }));
    }

    if (req.method === 'POST' && url.pathname === '/upload') {
      const b = JSON.parse((await readBody(req, 50)).toString('utf8') || '{}');
      const kind = ['photo', 'audio', 'video'].includes(b.kind) ? b.kind : 'photo';
      const ext = String(b.ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!SAFE_EXT.has(ext)) throw new Error('bad ext');
      if (!b.dataBase64) throw new Error('missing dataBase64');
      const ts = b.ts || new Date().toISOString();
      // media filename IS the timestamp: 2026-07-01_15-30-22.jpg (suffix only on collision)
      const stamp = ts.slice(0, 19).replace('T', '_').replace(/:/g, '-');
      let name = `${stamp}.${ext}`;
      for (let i = 2; fs.existsSync(path.join(MEDIA, name)); i++) name = `${stamp}-${i}.${ext}`;
      fs.writeFileSync(path.join(MEDIA, name), Buffer.from(b.dataBase64, 'base64'));
      const ev = { ts, type: kind, media: 'media/' + name, caption: b.caption || '', source: b.source || 'upload' };
      if (b.lat != null) { ev.lat = b.lat; ev.lng = b.lng; }
      appendEvents([ev]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, media: ev.media }));
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      // full log = all day files concatenated in chronological order
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      for (const d of loadManifest()) {
        const f = path.join(DAYS, d + '.jsonl');
        if (fs.existsSync(f)) res.write(fs.readFileSync(f));
      }
      if (fs.existsSync(LEGACY_JSONL)) res.write(fs.readFileSync(LEGACY_JSONL)); // pre-migration data
      return res.end();
    }

    // static site
    if (req.method === 'GET') {
      let p = decodeURIComponent(url.pathname);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        return fs.createReadStream(file).pipe(res);
      }
      res.writeHead(404); return res.end('not found');
    }

    res.writeHead(405); res.end();
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Life Tracker server → http://127.0.0.1:${PORT}`);
  console.log(`  POST /log      append events (Chrome extension, scripts)`);
  console.log(`  POST /upload   media upload (iPhone app)`);
  console.log(`  GET  /events   raw JSONL`);
  console.log(`  git sync: ${GIT_SYNC ? `on (batched every ${GIT_BATCH_MS / 1000}s)` : 'off'}`);
  if (migratedAtBoot) scheduleGitSync(); // commit the freshly split day files
});
