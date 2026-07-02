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

  // merge with an earlier visit to the same site within the past hour:
  // instead of a new log, send a revision that grows the existing one
  const { aggs = {} } = await chrome.storage.local.get('aggs');
  const a = aggs[s.domain];
  if (a && now - Date.parse(a.end) < MERGE_WINDOW_MS) {
    a.secs += secs;
    a.end = endIso;
    a.title = title || a.title;
    a.url = url;
    aggs[s.domain] = a;
    await chrome.storage.local.set({ aggs });
    await queue([{
      type: 'revision',
      target: a.ts + '|web',
      ts: endIso,
      data: { ts: a.ts, type: 'web', domain: s.domain, title: a.title, url: a.url, secs: a.secs, end: a.end, source: 'chrome' },
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
  aggs[s.domain] = { ts: ev.ts, end: ev.end, secs, title, url };
  for (const d of Object.keys(aggs)) {
    if (now - Date.parse(aggs[d].end) > MERGE_WINDOW_MS) delete aggs[d]; // prune stale
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

// YouTube watches arrive from the content script (dropped while paused)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.kind === 'yt-watch' && msg.secs >= MIN_SECONDS) {
    Promise.all([isPaused(), isExcluded('youtube.com')]).then(([paused, excluded]) => {
      if (paused || excluded) return;
      return queue([{
        ts: new Date(msg.start).toISOString(),
        type: 'youtube',
        videoId: msg.videoId,
        title: (msg.title || '').slice(0, 200),
        url: 'https://www.youtube.com/watch?v=' + msg.videoId,
        secs: Math.round(msg.secs),
        source: 'chrome',
      }]);
    }).then(() => sendResponse({ ok: true }));
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
    const res = await fetch(endpoint.replace(/\/$/, '') + '/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
    });
    if (res.ok) await chrome.storage.local.set({ q: [] }); // keep queue on failure — nothing is lost
  } catch { /* server offline; retry next alarm */ }
});

chrome.runtime.onStartup.addListener(() => { refreshActive(); updateBadge(); });
chrome.runtime.onInstalled.addListener(() => { refreshActive(); updateBadge(); });
