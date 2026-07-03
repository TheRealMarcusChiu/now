const domainEl = document.getElementById('domain');
const siteState = document.getElementById('sitestate');
const siteToggle = document.getElementById('sitetoggle');
const urlRow = document.getElementById('urlrow');
const fullUrlEl = document.getElementById('fullurl');
const ignoreUrlBtn = document.getElementById('ignoreurl');
const pauseState = document.getElementById('pausestate');
const pauseToggle = document.getElementById('pausetoggle');
const manageSub = document.getElementById('managesub');

let domain = null;
let fullUrl = null;      // normalized current page URL
let excluded = [];       // domain / glob patterns
let excludedUrls = [];   // exact URLs

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}
function normUrl(url) {
  return (url || '').split('#')[0].replace(/\/+$/, '').toLowerCase();
}

// glob patterns: * = anything, e.g. "*.lan"
function matchesPattern(dom, pat) {
  if (!dom || !pat) return false;
  if (!pat.includes('*')) return dom === pat;
  const re = new RegExp('^' + pat.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(dom);
}
function matchingEntries(dom) {
  return excluded.filter(p => matchesPattern(dom, p));
}
function urlExcluded() {
  return fullUrl && excludedUrls.some(u => normUrl(u) === fullUrl);
}

async function saveDomains(next) { excluded = next; await chrome.storage.local.set({ excluded: next }); renderSite(); renderManage(); }
async function saveUrls(next) { excludedUrls = next; await chrome.storage.local.set({ excludedUrls: next }); renderSite(); renderManage(); }

function renderManage() {
  manageSub.textContent = excluded.length + ' domain' + (excluded.length === 1 ? '' : 's') + ' · ' + excludedUrls.length + ' URL' + (excludedUrls.length === 1 ? '' : 's');
}

function renderSite() {
  if (!domain) return;
  const domHits = matchingEntries(domain);
  const off = domHits.length > 0 || urlExcluded();
  siteToggle.checked = !off;
  siteState.className = 'state ' + (off ? 'off' : 'on');
  siteState.textContent = !off ? 'tracked'
    : urlExcluded() && !domHits.length ? 'this URL not tracked'
    : 'not tracked' + (domHits[0] && domHits[0] !== domain ? ' · matches ' + domHits[0] : '');
  if (fullUrl) {
    const on = urlExcluded();
    ignoreUrlBtn.textContent = on ? 'Ignored ✓' : 'Ignore URL';
    ignoreUrlBtn.style.opacity = on ? '0.5' : '1';
  }
}

function renderPause(paused) {
  pauseToggle.checked = !paused;
  pauseState.className = 'state ' + (paused ? 'off' : 'on');
  pauseState.textContent = paused ? 'paused' : 'logging';
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab && tab.url;
  const trackable = url && /^https?:/.test(url);
  domain = trackable ? domainOf(url) : null;
  fullUrl = trackable ? normUrl(url) : null;

  const stored = await chrome.storage.local.get(['excluded', 'excludedUrls', 'paused']);
  excluded = stored.excluded || [];
  excludedUrls = stored.excludedUrls || [];
  renderPause(!!stored.paused);
  renderManage();

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
  urlRow.style.display = 'flex';
  fullUrlEl.textContent = fullUrl.replace(/^https?:\/\//, '');
  renderSite();
}

siteToggle.addEventListener('change', () => {
  if (siteToggle.checked) {
    // re-enable: clear every domain pattern AND exact-URL entry matching this page
    saveDomains(excluded.filter(p => !matchesPattern(domain, p)));
    if (urlExcluded()) saveUrls(excludedUrls.filter(u => normUrl(u) !== fullUrl));
  } else {
    saveDomains(excluded.includes(domain) ? excluded : excluded.concat([domain]));
  }
});

ignoreUrlBtn.addEventListener('click', () => {
  if (!fullUrl) return;
  if (urlExcluded()) saveUrls(excludedUrls.filter(u => normUrl(u) !== fullUrl));
  else saveUrls(excludedUrls.concat([fullUrl]));
});

pauseToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ paused: !pauseToggle.checked });
  renderPause(!pauseToggle.checked);
});

document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

init();
