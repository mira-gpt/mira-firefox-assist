const status = document.querySelector('#status');
const request = document.querySelector('#request');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
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
    status.textContent = 'Mira may inspect this tab.';
  } else if (result.hostState === 'connecting') {
    status.textContent = 'Connecting the local Mira bridge…';
  } else {
    status.textContent = 'This tab is not shared.';
  }
  start.disabled = result.active;
  stop.disabled = !result.active;
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
