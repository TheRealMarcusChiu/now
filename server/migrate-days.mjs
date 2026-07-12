// Life Tracker — migration: split the monolithic data/events.jsonl
// (and events.js) into per-day files.
//
// Run:  node server/migrate-days.mjs   (from the repo root, or anywhere)
// Also runs automatically at server startup (see server.mjs) — idempotent:
// re-running merges legacy + existing day files and drops exact duplicates,
// so a half-finished previous run or a no-op restart is always safe.
//
// Produces:
//   data/days/YYYY-MM-DD.jsonl   one file per UTC day (canonical)
//   data/days/YYYY-MM-DD.js      same events as __logEvent(...) lines (file:// fallback)
//   data/manifest.json           {"days":["2024-01-01", ...]} — what the site fetches first
//   data/manifest.js             window.__DAY_MANIFEST = [...] (file:// fallback)
//
// Then renames the originals to events.jsonl.bak / events.js.bak so nothing
// double-loads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DAYS = path.join(DATA, 'days');
const LEGACY_JSONL = path.join(DATA, 'events.jsonl');
const LEGACY_EVJS = path.join(DATA, 'events.js');

function parseJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function dayOf(e) {
  const d = String(e.ts || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : 'undated';
}

// Splits the legacy monolith (if present) into per-day files. Idempotent:
// no legacy file and a manifest already present ⇒ no-op. Returns a summary.
export function migrateDays({ log = console.log } = {}) {
  // fast path: nothing legacy to fold in and day files already exist → no-op
  if (!fs.existsSync(LEGACY_JSONL) && fs.existsSync(path.join(DATA, 'manifest.json'))) {
    return { migrated: 0, days: 0, skipped: true };
  }

  const legacy = parseJsonl(LEGACY_JSONL);
  let existing = [];
  if (fs.existsSync(DAYS)) {
    for (const f of fs.readdirSync(DAYS).filter(f => f.endsWith('.jsonl')).sort()) {
      existing = existing.concat(parseJsonl(path.join(DAYS, f)));
    }
  }
  if (!legacy.length && !existing.length) {
    log('nothing to migrate: no data/events.jsonl and no data/days/*.jsonl');
    return { migrated: 0, days: 0, skipped: true };
  }

  // merge, preserving order (existing day files first, then legacy), drop exact dupes
  const seen = new Set();
  const all = [];
  for (const e of existing.concat(legacy)) {
    const k = JSON.stringify(e);
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  // stable sort by ts so each day file reads chronologically
  all.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  // group by day and write
  fs.mkdirSync(DAYS, { recursive: true });
  const byDay = new Map();
  for (const e of all) {
    const d = dayOf(e);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }

  const days = [...byDay.keys()].sort();
  for (const d of days) {
    const evs = byDay.get(d);
    fs.writeFileSync(path.join(DAYS, d + '.jsonl'), evs.map(e => JSON.stringify(e)).join('\n') + '\n');
    fs.writeFileSync(path.join(DAYS, d + '.js'), evs.map(e => '__logEvent(' + JSON.stringify(e) + ');').join('\n') + '\n');
  }

  fs.writeFileSync(path.join(DATA, 'manifest.json'), JSON.stringify({ days }, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'manifest.js'),
    '// AUTO-GENERATED list of per-day log files under data/days/.\n' +
    'window.__DAY_MANIFEST = ' + JSON.stringify(days) + ';\n');

  // retire the monoliths so nothing double-loads
  if (fs.existsSync(LEGACY_JSONL)) fs.renameSync(LEGACY_JSONL, LEGACY_JSONL + '.bak');
  if (fs.existsSync(LEGACY_EVJS)) fs.renameSync(LEGACY_EVJS, LEGACY_EVJS + '.bak');

  log(`migrated ${all.length} events into ${days.length} day files (data/days/)`);
  log(`  first day: ${days[0]}   last day: ${days[days.length - 1]}`);
  log('  originals kept as events.jsonl.bak / events.js.bak — delete them once the site looks right');
  return { migrated: all.length, days: days.length, skipped: false };
}

// CLI: run directly with `node server/migrate-days.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = migrateDays();
  if (!r.skipped) console.log('  remember to commit: git add -A data && git commit -m "split log into per-day files"');
}
