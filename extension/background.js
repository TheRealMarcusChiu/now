// Life Tracker — MV3 service worker.
// Tracks the active tab: when you switch tabs/windows or go idle, the finished
// session (domain, title, url, seconds) is queued and flushed to the server.
// The toolbar popup pauses/resumes tracking and excludes individual domains
// (badge ❚❚ = paused).

const DEFAULT_ENDPOINT = 'https://git.now.lan';
const MIN_SECONDS = 5;      // ignore blips shorter than this
const FLUSH_EVERY_MIN = 0.5;
const MERGE_WINDOW_MS = 60 * 60 * 1000; // revisits within an hour merge into one log

let current = null; // { url, domain, title, start }

// Seeded on first install (see onInstalled). Users can edit/remove any of these
// in the popup; seeding never overwrites lists that already exist.
const DEFAULT_EXCLUDED = [
  // local & dev noise
  'localhost', '127.0.0.1', '*.local', '*.lan', '*.test',
  // auth / account / password managers (noisy + sensitive)
  'accounts.google.com', 'login.*', '*.okta.com', '*.1password.com', 'vault.bitwarden.com',
  // banking & finance
  '*.chase.com', '*.paypal.com', '*.venmo.com', '*.coinbase.com', 'turbotax.com', '*.irs.gov',
  // health & medical
  'mychart.*', '*.kaiserpermanente.org',
  // email & messaging
  'mail.google.com', 'outlook.*', 'web.whatsapp.com', '*.messenger.com', 'web.telegram.org',
];
const DEFAULT_EXCLUDED_URLS = [
  // low-signal feed/home pages
  'https://www.youtube.com/',
  'https://www.youtube.com/feed/subscriptions',
  'https://twitter.com/home',
  'https://x.com/home',
  'https://www.reddit.com/',
];

async function seedDefaults() {
  const cur = await chrome.storage.local.get(['excluded', 'excludedUrls']);
  const patch = {};
  if (cur.excluded === undefined) patch.excluded = DEFAULT_EXCLUDED;
  if (cur.excludedUrls === undefined) patch.excludedUrls = DEFAULT_EXCLUDED_URLS;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function trackable(url) {
  return url && /^https?:/.test(url) && !url.startsWith('chrome');
}

async function isPaused() {
  const { paused = false } = await chrome.storage.local.get('paused');
  return paused;
}

// exclusion entries are exact domains or glob patterns (* = anything), e.g. "*.lan"
function matchesPattern(domain, pat) {
  if (!domain || !pat) return false;
  if (!pat.includes('*')) return domain === pat;
  const re = new RegExp('^' + pat.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(domain);
}

async function isExcluded(domain) {
  const { excluded = [] } = await chrome.storage.local.get('excluded');
  return excluded.some(p => matchesPattern(domain, p));
}

// exact-URL exclusions: more specific than a domain — ignore ONE url, not the
// whole site (e.g. https://www.youtube.com/ but still log individual videos).
function normUrl(url) {
  return (url || '').split('#')[0].replace(/\/+$/, '').toLowerCase();
}

async function isExcludedUrl(url) {
  const { excludedUrls = [] } = await chrome.storage.local.get('excludedUrls');
  const n = normUrl(url);
  return excludedUrls.some(u => normUrl(u) === n);
}

async function updateBadge() {
  const paused = await isPaused();
  chrome.action.setBadgeText({ text: paused ? '❚❚' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#d8a942' });
  chrome.action.setBadgeTextColor({ color: '#0f0c09' });
  chrome.action.setTitle({
    title: paused ? 'Life Tracker — paused (click to resume)' : 'Life Tracker — logging (click to pause)',
  });
}

async function queue(events) {
  if (!events.length) return;
  const { q = [] } = await chrome.storage.local.get('q');
  let next = q;
  for (const ev of events) {
    if (ev.type === 'revision') {
      // compact: an unsent revision to the same log is superseded by this one
      next = next.filter(x => !(x.type === 'revision' && x.target === ev.target));
    }
    next = next.concat([ev]);
  }
  await chrome.storage.local.set({ q: next.slice(-2000) });
}

async function endSession(now) {
  if (!current) return;
  const secs = Math.round((now - current.start) / 1000);
  const s = current;
  current = null;
  if (secs < MIN_SECONDS) return;
  const endIso = new Date(now).toISOString();
  const title = (s.title || '').slice(0, 200);
  const url = s.url.split('#')[0].slice(0, 500);

  // merge with an earlier visit to the same full URL within the past hour:
  // instead of a new log, send a revision that grows the existing one
  const { aggs = {} } = await chrome.storage.local.get('aggs');
  const a = aggs[url];
  if (a && now - Date.parse(a.end) < MERGE_WINDOW_MS) {
    a.secs += secs;
    a.end = endIso;
    a.title = title || a.title;
    aggs[url] = a;
    await chrome.storage.local.set({ aggs });
    await queue([{
      type: 'revision',
      target: a.ts + '|web',
      ts: endIso,
      data: { ts: a.ts, type: 'web', domain: s.domain, title: a.title, url, secs: a.secs, end: a.end, source: 'chrome' },
    }]);
    return;
  }

  // fresh log (start + end times); becomes the merge target for the next hour
  const ev = {
    ts: new Date(s.start).toISOString(),
    end: endIso,
    type: 'web',
    domain: s.domain,
    title,
    url,
    secs,
    source: 'chrome',
  };
  aggs[url] = { ts: ev.ts, end: ev.end, secs, title };
  for (const k of Object.keys(aggs)) {
    if (now - Date.parse(aggs[k].end) > MERGE_WINDOW_MS) delete aggs[k]; // prune stale
  }
  await chrome.storage.local.set({ aggs });
  await queue([ev]);
}

async function startSession(tab) {
  const now = Date.now();
  await endSession(now);
  if (!tab || !trackable(tab.url)) return;
  if (await isPaused()) return; // paused: finish old sessions, never start new ones
  const domain = domainOf(tab.url);
  if (await isExcluded(domain)) return; // domain opted out via popup
  if (await isExcludedUrl(tab.url)) return; // this exact URL opted out
  current = { url: tab.url, domain, title: tab.title, start: now };
}

async function refreshActive() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await startSession(tab);
}

// react to pause / exclusion changes from anywhere (popup or options page)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.paused) {
    if (changes.paused.newValue) endSession(Date.now());
    else refreshActive();
    updateBadge();
  }
  if (changes.excluded) {
    const list = changes.excluded.newValue || [];
    if (current && list.some(p => matchesPattern(current.domain, p))) current = null; // discard in-progress session, don't log it
    else refreshActive(); // domain re-enabled: start tracking if it's the active tab
  }
  if (changes.excludedUrls) {
    const list = changes.excludedUrls.newValue || [];
    if (current && list.some(u => normUrl(u) === normUrl(current.url))) current = null; // discard in-progress session
    else refreshActive();
  }
});

chrome.tabs.onActivated.addListener(refreshActive);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // same tab navigated somewhere new
  if (tab.active && info.url) startSession(tab);
  else if (tab.active && info.title && current && tab.url === current.url) current.title = info.title;
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) await endSession(Date.now());
  else await refreshActive();
});
chrome.idle.setDetectionInterval(120);
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state !== 'active') await endSession(Date.now());
  else await refreshActive();
});

// YouTube watches arrive from the content script, reported periodically during
// playback. We merge repeats of the same session (msg.key) into one growing log:
// the first report writes a fresh 'youtube' event, later ones send a revision.
async function handleYtWatch(msg) {
  if (await isPaused()) return;
  if (await isExcluded('youtube.com')) return;
  const now = Date.now();
  const secs = Math.round(msg.secs);
  const url = 'https://www.youtube.com/watch?v=' + msg.videoId;
  const key = msg.key || (msg.videoId + '|' + msg.start);
  const { ytaggs = {} } = await chrome.storage.local.get('ytaggs');
  const a = ytaggs[key];
  if (a) {
    a.secs = Math.max(a.secs, secs); // reports carry cumulative seconds
    a.title = msg.title || a.title;
    a.end = now;
    ytaggs[key] = a;
    await chrome.storage.local.set({ ytaggs });
    return queue([{
      type: 'revision',
      target: a.ts + '|youtube',
      ts: new Date(now).toISOString(),
      data: { ts: a.ts, type: 'youtube', videoId: msg.videoId, title: a.title, url, secs: a.secs, source: 'chrome' },
    }]);
  }
  const startIso = new Date(msg.start).toISOString();
  ytaggs[key] = { ts: startIso, secs, title: msg.title, end: now };
  for (const k of Object.keys(ytaggs)) {
    if (now - ytaggs[k].end > MERGE_WINDOW_MS) delete ytaggs[k]; // prune stale
  }
  await chrome.storage.local.set({ ytaggs });
  return queue([{
    ts: startIso,
    type: 'youtube',
    videoId: msg.videoId,
    title: (msg.title || '').slice(0, 200),
    url,
    secs,
    source: 'chrome',
  }]);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.kind === 'yt-watch' && msg.secs >= MIN_SECONDS) {
    handleYtWatch(msg).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// periodic flush to the server (already-queued events still send while paused)
chrome.alarms.create('flush', { periodInMinutes: FLUSH_EVERY_MIN });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'flush') return;
  const { q = [], endpoint = DEFAULT_ENDPOINT } = await chrome.storage.local.get(['q', 'endpoint']);
  if (!q.length) return;
  try {
    const res = await fetch(endpoint.trim().replace(/\/+$/, '') + '/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
    });
    if (res.ok) await chrome.storage.local.set({ q: [] }); // keep queue on failure — nothing is lost
  } catch { /* server offline; retry next alarm */ }
});

chrome.runtime.onStartup.addListener(() => { refreshActive(); updateBadge(); });
chrome.runtime.onInstalled.addListener(async () => { await seedDefaults(); refreshActive(); updateBadge(); });
