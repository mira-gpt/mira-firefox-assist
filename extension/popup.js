const status = document.querySelector('#status');
const request = document.querySelector('#request');
const start = document.querySelector('#start');
const yolo = document.querySelector('#yolo');
const yoloRisk = document.querySelector('#yolo-risk');
const newUrl = document.querySelector('#new-url');
const openWindow = document.querySelector('#open-window');
const stop = document.querySelector('#stop');
const control = document.querySelector('#control');
let humanControl = false;
const dialogue = document.querySelector('#dialogue');
const messages = document.querySelector('#messages');
const note = document.querySelector('#note');
const sendNote = document.querySelector('#send-note');

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
    status.textContent = result.yolo ? 'YOLO active on this tab. Revoke access to stop.' : 'Mira may inspect this tab.';
  } else if (result.hostState === 'connecting') {
    status.textContent = 'Connecting the local Mira bridge…';
  } else {
    status.textContent = 'This tab is not shared.';
  }
  start.disabled = result.active;
  yolo.disabled = result.active;
  yoloRisk.disabled = result.active || !yolo.checked;
  stop.disabled = !result.active;
  control.disabled = !result.active;
  humanControl = result.humanControl;
  control.textContent = humanControl ? 'Mira, continue please' : 'Human controls now';
  if (result.active && humanControl) status.textContent = 'Human in control; Mira actions are paused.';
  dialogue.hidden = !result.active;
  sendNote.disabled = !result.active;
  renderMessages(result.messages || [], result.assistantState);
}

function renderMessages(items, assistantState) {
  messages.replaceChildren();
  if (assistantState) {
    const state = document.createElement('p');
    state.className = 'message status';
    state.textContent = `Mira: ${assistantState}`;
    messages.append(state);
  }
  for (const item of items) {
    const line = document.createElement('p');
    line.className = `message ${item.role || 'status'}`;
    line.textContent = `${item.role === 'assistant' ? 'Mira' : 'You'}: ${item.text}`;
    messages.append(line);
  }
  messages.scrollTop = messages.scrollHeight;
}

start.addEventListener('click', async () => {
  if (yolo.checked && !yoloRisk.checked) {
    status.textContent = 'Please acknowledge the YOLO risks before starting.';
    return;
  }
  try {
    const tab = await activeTab();
    await browser.runtime.sendMessage({type: 'start', tabId: tab.id, request: request.value.trim(), yolo: yolo.checked, yoloRiskAccepted: yoloRisk.checked});
  } catch (error) {
    status.textContent = `Could not start assistance: ${error.message}`;
  } finally {
    await refresh();
  }
});

yolo.addEventListener('change', () => {
  yoloRisk.disabled = !yolo.checked;
  if (!yolo.checked) yoloRisk.checked = false;
});

openWindow.addEventListener('click', async () => {
  try {
    if (yolo.checked && !yoloRisk.checked) throw new Error('Please acknowledge the YOLO risks first.');
    const url = new URL(newUrl.value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP(S) URL without credentials.');
    const granted = await browser.permissions.request({origins: [`${url.origin}/*`]});
    if (!granted) throw new Error('Site access was not granted.');
    await browser.runtime.sendMessage({type: 'open_window', url: url.href, request: request.value.trim(),
      yolo: yolo.checked, yoloRiskAccepted: yoloRisk.checked});
  } catch (error) {
    status.textContent = `Could not open and share: ${error.message}`;
  }
});

stop.addEventListener('click', async () => {
  const tab = await activeTab();
  await browser.runtime.sendMessage({type: 'stop', tabId: tab.id});
  await refresh();
});

control.addEventListener('click', async () => {
  const tab = await activeTab();
  await browser.runtime.sendMessage({type: 'set_control', tabId: tab.id, humanControl: !humanControl});
  await refresh();
});

sendNote.addEventListener('click', async () => {
  const text = note.value.trim();
  if (!text) return;
  try {
    const tab = await activeTab();
    await browser.runtime.sendMessage({type: 'user_note', tabId: tab.id, text});
    note.value = '';
  } catch (error) {
    status.textContent = `Could not send message: ${error.message}`;
  } finally {
    await refresh();
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'assist_feedback') refresh();
});

refresh();
