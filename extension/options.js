const $ = (id) => document.getElementById(id);
const endpointInput = $('endpoint');
const endpointStatus = $('endpointStatus');
const testStatus = $('teststatus');
const pausedBox = $('paused');
const domainsTA = $('domains');
const urlsTA = $('urls');

// ---- helpers ----
function parseLines(text) {
  // one entry per line; blank lines and #-comments dropped; de-duped, order kept
  const seen = new Set();
  const out = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
function normDomain(p) {
  return p.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}
function normUrlInput(v) {
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  return v;
}
function count(arr) { return arr.length + ' entr' + (arr.length === 1 ? 'y' : 'ies'); }
function flash(el, msg, cls) {
  el.className = 'msg ' + (cls || 'ok');
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 2400);
}

// ---- initial load ----
async function load() {
  const { endpoint, paused, excluded = [], excludedUrls = [] } = await chrome.storage.local.get(['endpoint', 'paused', 'excluded', 'excludedUrls']);
  endpointInput.value = endpoint || 'https://git.now.lan';
  pausedBox.checked = !!paused;
  setDomains(excluded);
  setUrls(excludedUrls);
}
function setDomains(list) {
  domainsTA.value = list.join('\n');
  $('domainsCount').textContent = count(list);
}
function setUrls(list) {
  urlsTA.value = list.join('\n');
  $('urlsCount').textContent = count(list);
}

// keep textareas & counts in sync if the popup edits the lists while this page is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.excluded && document.activeElement !== domainsTA) setDomains(changes.excluded.newValue || []);
  if (changes.excludedUrls && document.activeElement !== urlsTA) setUrls(changes.excludedUrls.newValue || []);
  if (changes.paused) pausedBox.checked = !!changes.paused.newValue;
});

// live count as you type
domainsTA.addEventListener('input', () => { $('domainsCount').textContent = count(parseLines(domainsTA.value)); });
urlsTA.addEventListener('input', () => { $('urlsCount').textContent = count(parseLines(urlsTA.value)); });

// ---- pause ----
pausedBox.addEventListener('change', () => chrome.storage.local.set({ paused: pausedBox.checked }));

// ---- endpoint ----
function endpointValue() { return endpointInput.value.trim().replace(/\/+$/, ''); }
$('test').addEventListener('click', async () => {
  flash(testStatus, 'testing…', 'dim');
  try {
    const res = await fetch(endpointValue() + '/log', { method: 'OPTIONS' });
    if (res.ok) flash(testStatus, 'connected ✓', 'ok');
    else flash(testStatus, 'HTTP ' + res.status + ' ✗', 'bad');
  } catch {
    flash(testStatus, 'unreachable ✗ — is node server/server.mjs running?', 'bad');
  }
});
$('saveEndpoint').addEventListener('click', async () => {
  await chrome.storage.local.set({ endpoint: endpointValue() });
  flash(endpointStatus, 'saved ✓', 'ok');
});

// ---- domains ----
$('saveDomains').addEventListener('click', async () => {
  const list = parseLines(domainsTA.value).map(normDomain).filter(Boolean);
  const uniq = [...new Set(list)];
  setDomains(uniq);
  await chrome.storage.local.set({ excluded: uniq });
  flash($('domainsStatus'), 'saved ' + count(uniq) + ' ✓', 'ok');
});
$('resetDomains').addEventListener('click', async () => {
  const btn = $('resetDomains');
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Click again to reset'; setTimeout(() => { btn.dataset.armed = '0'; btn.textContent = 'Reset to defaults'; }, 3000); return; }
  btn.dataset.armed = '0'; btn.textContent = 'Reset to defaults';
  const def = (self.LT_DEFAULT_EXCLUDED || []).slice();
  setDomains(def);
  await chrome.storage.local.set({ excluded: def });
  flash($('domainsStatus'), 'reset to ' + count(def) + ' ✓', 'ok');
});

// ---- urls ----
$('saveUrls').addEventListener('click', async () => {
  const list = parseLines(urlsTA.value).map(normUrlInput);
  const seen = new Set(); const uniq = [];
  for (const u of list) { const k = u.split('#')[0].replace(/\/+$/, '').toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(u); } }
  setUrls(uniq);
  await chrome.storage.local.set({ excludedUrls: uniq });
  flash($('urlsStatus'), 'saved ' + count(uniq) + ' ✓', 'ok');
});
$('resetUrls').addEventListener('click', async () => {
  const btn = $('resetUrls');
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Click again to reset'; setTimeout(() => { btn.dataset.armed = '0'; btn.textContent = 'Reset to defaults'; }, 3000); return; }
  btn.dataset.armed = '0'; btn.textContent = 'Reset to defaults';
  const def = (self.LT_DEFAULT_EXCLUDED_URLS || []).slice();
  setUrls(def);
  await chrome.storage.local.set({ excludedUrls: def });
  flash($('urlsStatus'), 'reset to ' + count(def) + ' ✓', 'ok');
});

load();
