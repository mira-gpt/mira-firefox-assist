const status = document.querySelector('#status');
const request = document.querySelector('#request');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');

async function activeTab() {
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  return tab;
}

async function refresh() {
  const tab = await activeTab();
  const result = await browser.runtime.sendMessage({type: 'status', tabId: tab.id});
  status.textContent = result.active ? 'Mira may inspect this tab.' : 'This tab is not shared.';
  start.disabled = result.active;
  stop.disabled = !result.active;
}

start.addEventListener('click', async () => {
  const tab = await activeTab();
  await browser.runtime.sendMessage({type: 'start', tabId: tab.id, request: request.value.trim()});
  await refresh();
});

stop.addEventListener('click', async () => {
  const tab = await activeTab();
  await browser.runtime.sendMessage({type: 'stop', tabId: tab.id});
  await refresh();
});

refresh();
