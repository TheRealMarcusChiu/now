const domainEl = document.getElementById('domain');
const siteState = document.getElementById('sitestate');
const siteToggle = document.getElementById('sitetoggle');
const pauseState = document.getElementById('pausestate');
const pauseToggle = document.getElementById('pausetoggle');
const patList = document.getElementById('patlist');
const patEmpty = document.getElementById('patempty');
const patForm = document.getElementById('patform');
const patInput = document.getElementById('patinput');

let domain = null;
let excluded = [];

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

// exclusion entries are exact domains or glob patterns (* = anything), e.g. "*.lan"
function matchesPattern(dom, pat) {
  if (!dom || !pat) return false;
  if (!pat.includes('*')) return dom === pat;
  const re = new RegExp('^' + pat.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(dom);
}

function matchingEntries(dom) {
  return excluded.filter(p => matchesPattern(dom, p));
}

async function setExcluded(next) {
  excluded = next;
  await chrome.storage.local.set({ excluded: next });
  renderSite();
  renderList();
}

function renderSite() {
  if (!domain) return;
  const hits = matchingEntries(domain);
  const off = hits.length > 0;
  siteToggle.checked = !off;
  siteState.className = 'state ' + (off ? 'off' : 'on');
  siteState.textContent = off
    ? 'not tracked' + (hits[0] !== domain ? ' · matches ' + hits[0] : '')
    : 'tracked';
}

function renderList() {
  patList.innerHTML = '';
  patEmpty.style.display = excluded.length ? 'none' : 'block';
  for (const pat of excluded) {
    const row = document.createElement('div');
    row.className = 'patrow' + (domain && matchesPattern(domain, pat) ? ' hit' : '');
    const code = document.createElement('code');
    code.textContent = pat;
    const x = document.createElement('button');
    x.className = 'patx';
    x.title = 'Remove — resume tracking';
    x.textContent = '×';
    x.addEventListener('click', () => setExcluded(excluded.filter(p => p !== pat)));
    row.appendChild(code);
    row.appendChild(x);
    patList.appendChild(row);
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
  domain = url && /^https?:/.test(url) ? domainOf(url) : null;

  const stored = await chrome.storage.local.get(['excluded', 'paused']);
  excluded = stored.excluded || [];
  renderPause(!!stored.paused);
  renderList();

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
  renderSite();
}

siteToggle.addEventListener('change', () => {
  if (siteToggle.checked) {
    // re-enable: remove every entry (exact or pattern) that matches this domain
    setExcluded(excluded.filter(p => !matchesPattern(domain, p)));
  } else {
    setExcluded(excluded.includes(domain) ? excluded : excluded.concat([domain]));
  }
});

patForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pat = patInput.value.trim().toLowerCase().replace(/^www\./, '');
  if (!pat || excluded.includes(pat)) { patInput.value = ''; return; }
  patInput.value = '';
  setExcluded(excluded.concat([pat]));
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
