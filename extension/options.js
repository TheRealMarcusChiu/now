const input = document.getElementById('endpoint');
const status = document.getElementById('status');
const testStatus = document.getElementById('teststatus');

chrome.storage.local.get('endpoint').then(({ endpoint }) => {
  input.value = endpoint || 'http://127.0.0.1:8787';
});

function endpointValue() {
  return input.value.trim().replace(/\/$/, '');
}

document.getElementById('test').addEventListener('click', async () => {
  testStatus.className = 'dim';
  testStatus.textContent = 'testing…';
  try {
    const res = await fetch(endpointValue() + '/log', { method: 'OPTIONS' });
    if (res.ok) {
      testStatus.className = 'ok';
      testStatus.textContent = 'connected ✓';
    } else {
      testStatus.className = 'bad';
      testStatus.textContent = 'HTTP ' + res.status + ' ✗';
    }
  } catch {
    testStatus.className = 'bad';
    testStatus.textContent = 'unreachable ✗ — is node server/server.mjs running?';
  }
});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ endpoint: endpointValue() });
  status.textContent = 'saved ✓';
  setTimeout(() => (status.textContent = ''), 1800);
});
