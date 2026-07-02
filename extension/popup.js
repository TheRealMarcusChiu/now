const domainEl = document.getElementById('domain');
const siteState = document.getElementById('sitestate');
const siteToggle = document.getElementById('sitetoggle');
const pauseState = document.getElementById('pausestate');
const pauseToggle = document.getElementById('pausetoggle');

let domain = null;

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function renderSite(excluded) {
  const off = excluded.includes(domain);
  siteToggle.checked = !off;
  siteState.className = 'state ' + (off ? 'off' : 'on');
  siteState.textContent = off ? 'not tracked' : 'tracked';
}

function renderPause(paused) {
  pauseToggle.checked = !paused;
  pauseState.className = 'state ' + (paused ? 'off' : 'on');
  pauseState.textContent = paused ? 'paused' : 'logging';
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab && tab.url;
  domain = url && /^https?:/.test(url) ? domainOf(url) : null;

  const { excluded = [], paused = false } = await chrome.storage.local.get(['excluded', 'paused']);
  renderPause(paused);

  if (!domain) {
    domainEl.textContent = 'this page';
    domainEl.className = 'dim';
    siteState.className = 'state dim';
    siteState.textContent = 'not trackable';
    siteToggle.disabled = true;
    return;
  }
  domainEl.textContent = domain;
  domainEl.className = '';
  siteToggle.disabled = false;
  renderSite(excluded);
}

siteToggle.addEventListener('change', async () => {
  const { excluded = [] } = await chrome.storage.local.get('excluded');
  const next = siteToggle.checked
    ? excluded.filter(d => d !== domain)
    : excluded.concat(excluded.includes(domain) ? [] : [domain]);
  await chrome.storage.local.set({ excluded: next });
  renderSite(next);
});

pauseToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ paused: !pauseToggle.checked });
  renderPause(!pauseToggle.checked);
});

document.getElementById('options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
