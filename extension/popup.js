const domainEl = document.getElementById('domain');
const siteState = document.getElementById('sitestate');
const siteToggle = document.getElementById('sitetoggle');
const urlRow = document.getElementById('urlrow');
const fullUrlEl = document.getElementById('fullurl');
const ignoreUrlBtn = document.getElementById('ignoreurl');
const pauseState = document.getElementById('pausestate');
const pauseToggle = document.getElementById('pausetoggle');

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

async function saveDomains(next) { excluded = next; await chrome.storage.local.set({ excluded: next }); renderSite(); renderDomList(); }
async function saveUrls(next) { excludedUrls = next; await chrome.storage.local.set({ excludedUrls: next }); renderSite(); renderUrlList(); }

// ---- generic list renderer (filter + scroll + remove) ----
function renderList(items, opts) {
  const { listEl, emptyEl, countEl, filterEl, isHit, onRemove } = opts;
  countEl.textContent = items.length ? items.length : '';
  // filter box appears only once the list is long enough to need it
  const showFilter = items.length > 5;
  filterEl.style.display = showFilter ? 'block' : 'none';
  const q = showFilter ? filterEl.value.trim().toLowerCase() : '';
  const shown = q ? items.filter(x => x.toLowerCase().includes(q)) : items;

  listEl.innerHTML = '';
  emptyEl.style.display = items.length ? 'none' : 'block';
  for (const entry of shown) {
    const row = document.createElement('div');
    row.className = 'patrow' + (isHit(entry) ? ' hit' : '');
    const code = document.createElement('code');
    code.textContent = entry;
    code.title = 'Click to edit';
    code.style.flex = '1';
    code.style.cursor = 'text';
    // click-to-edit in place: swap the label for an input, save on Enter/blur
    code.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'txt';
      inp.value = entry;
      inp.style.flex = '1';
      inp.style.minWidth = '0';
      inp.spellcheck = false;
      let done = false;
      const commit = (save) => {
        if (done) return; done = true;
        const v = inp.value.trim();
        if (save && v && v !== entry) opts.onEdit(entry, v);
        else opts.rerender();
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      });
      inp.addEventListener('blur', () => commit(true));
      row.replaceChild(inp, code);
      inp.focus();
      inp.select();
    });
    const x = document.createElement('button');
    x.className = 'patx';
    x.title = 'Remove — resume tracking';
    x.textContent = '×';
    x.addEventListener('click', () => onRemove(entry));
    row.appendChild(code);
    row.appendChild(x);
    listEl.appendChild(row);
  }
  if (q && !shown.length) {
    const none = document.createElement('div');
    none.className = 'empty';
    none.textContent = 'no matches';
    listEl.appendChild(none);
  }
}

function renderDomList() {
  renderList(excluded, {
    listEl: document.getElementById('domlist'),
    emptyEl: document.getElementById('domempty'),
    countEl: document.getElementById('domcount'),
    filterEl: document.getElementById('domfilter'),
    isHit: (p) => domain && matchesPattern(domain, p),
    onRemove: (p) => saveDomains(excluded.filter(x => x !== p)),
    onEdit: (oldP, newP) => {
      const p = newP.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (!p || (p !== oldP && excluded.includes(p))) return renderDomList();
      saveDomains(excluded.map(x => x === oldP ? p : x));
    },
    rerender: renderDomList,
  });
}
function renderUrlList() {
  renderList(excludedUrls, {
    listEl: document.getElementById('urllist'),
    emptyEl: document.getElementById('urlempty'),
    countEl: document.getElementById('urlcount'),
    filterEl: document.getElementById('urlfilter'),
    isHit: (u) => fullUrl && normUrl(u) === fullUrl,
    onRemove: (u) => saveUrls(excludedUrls.filter(x => x !== u)),
    onEdit: (oldU, newU) => {
      let v = newU;
      if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
      const n = normUrl(v);
      if (!n || (n !== normUrl(oldU) && excludedUrls.some(u => normUrl(u) === n))) return renderUrlList();
      saveUrls(excludedUrls.map(x => x === oldU ? v : x));
    },
    rerender: renderUrlList,
  });
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
  // reflect whether the current exact URL is already ignored
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
  renderDomList();
  renderUrlList();

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

document.getElementById('domform').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = document.getElementById('dominput');
  const pat = inp.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  inp.value = '';
  if (pat && !excluded.includes(pat)) saveDomains(excluded.concat([pat]));
});

document.getElementById('urlform').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = document.getElementById('urlinput');
  let v = inp.value.trim();
  inp.value = '';
  if (!v) return;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  const n = normUrl(v);
  if (n && !excludedUrls.some(u => normUrl(u) === n)) saveUrls(excludedUrls.concat([v]));
});

document.getElementById('domfilter').addEventListener('input', renderDomList);
document.getElementById('urlfilter').addEventListener('input', renderUrlList);

pauseToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ paused: !pauseToggle.checked });
  renderPause(!pauseToggle.checked);
});

document.getElementById('options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
