// Life Tracker — MV3 service worker.
// Tracks the active tab: when you switch tabs/windows or go idle, the finished
// session (domain, title, url, seconds) is queued and flushed to the server.

const DEFAULT_ENDPOINT = 'https://git.now.lan';
const MIN_SECONDS = 5;      // ignore blips shorter than this
const FLUSH_EVERY_MIN = 0.5;

let current = null; // { url, domain, title, start }

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function trackable(url) {
  return url && /^https?:/.test(url) && !url.startsWith('chrome');
}

async function queue(events) {
  if (!events.length) return;
  const { q = [] } = await chrome.storage.local.get('q');
  await chrome.storage.local.set({ q: q.concat(events).slice(-2000) });
}

async function endSession(now) {
  if (!current) return;
  const secs = Math.round((now - current.start) / 1000);
  const s = current;
  current = null;
  if (secs < MIN_SECONDS) return;
  await queue([{
    ts: new Date(s.start).toISOString(),
    type: 'web',
    domain: s.domain,
    title: (s.title || '').slice(0, 200),
    url: s.url.split('#')[0].slice(0, 500),
    secs,
    source: 'chrome',
  }]);
}

async function startSession(tab) {
  const now = Date.now();
  await endSession(now);
  if (!tab || !trackable(tab.url)) return;
  current = { url: tab.url, domain: domainOf(tab.url), title: tab.title, start: now };
}

async function refreshActive() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await startSession(tab);
}

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

// YouTube watches arrive from the content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.kind === 'yt-watch' && msg.secs >= MIN_SECONDS) {
    queue([{
      ts: new Date(msg.start).toISOString(),
      type: 'youtube',
      videoId: msg.videoId,
      title: (msg.title || '').slice(0, 200),
      url: 'https://www.youtube.com/watch?v=' + msg.videoId,
      secs: Math.round(msg.secs),
      source: 'chrome',
    }]).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// periodic flush to the server
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

chrome.runtime.onStartup.addListener(refreshActive);
chrome.runtime.onInstalled.addListener(refreshActive);
