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
  if (result.hostError) {
    status.textContent = `Native host error: ${result.hostError}`;
  } else if (result.active) {
    status.textContent = 'Mira may inspect this tab.';
  } else if (result.hostState === 'connecting') {
    status.textContent = 'Connecting the local Mira bridge…';
  } else {
    status.textContent = 'This tab is not shared.';
  }
  start.disabled = result.active;
  stop.disabled = !result.active;
}

start.addEventListener('click', async () => {
  try {
    const tab = await activeTab();
    await browser.runtime.sendMessage({type: 'start', tabId: tab.id, request: request.value.trim()});
  } catch (error) {
    status.textContent = `Could not start assistance: ${error.message}`;
  } finally {
    await refresh();
  }
});

stop.addEventListener('click', async () => {
  const tab = await activeTab();
  await browser.runtime.sendMessage({type: 'stop', tabId: tab.id});
  await refresh();
});

refresh();
