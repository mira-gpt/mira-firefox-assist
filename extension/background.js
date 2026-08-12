const HOST = 'org.mira.firefox_assist';
const sessions = new Map();
let host = null;

function connectHost() {
  if (host) return host;
  host = browser.runtime.connectNative(HOST);
  host.onMessage.addListener(handleHostMessage);
  host.onDisconnect.addListener(() => { host = null; });
  return host;
}

function sendHost(message) {
  try {
    connectHost().postMessage(message);
  } catch (error) {
    console.error('Mira native host unavailable:', error);
  }
}

async function inject(tabId) {
  await browser.scripting.executeScript({target: {tabId}, files: ['content.js']});
}

async function handleHostMessage(message) {
  const found = message.tabId === undefined
    ? [...sessions.entries()].find(([, session]) => session.id === message.sessionId)
    : [message.tabId, sessions.get(message.tabId)];
  const [tabId, session] = found || [];
  if (!session || session.id !== message.sessionId) return;
  if (message.type === 'snapshot') {
    await browser.tabs.sendMessage(tabId, {type: 'snapshot', sessionId: session.id});
  }
  if (message.type === 'action_request') {
    await browser.tabs.sendMessage(tabId, {
      type: 'action_request', sessionId: session.id, action: message.action
    });
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === 'status') return {active: sessions.has(message.tabId)};

  if (message.type === 'start') {
    await inject(message.tabId);
    const id = crypto.randomUUID();
    sessions.set(message.tabId, {id});
    sendHost({type: 'session_started', sessionId: id, tabId: message.tabId, request: message.request || ''});
    await browser.tabs.sendMessage(message.tabId, {type: 'snapshot', sessionId: id});
    return {active: true};
  }

  if (message.type === 'stop') {
    const session = sessions.get(message.tabId);
    if (session) sendHost({type: 'session_stopped', sessionId: session.id, tabId: message.tabId});
    sessions.delete(message.tabId);
    return {active: false};
  }

  if (message.type === 'snapshot' && sender.tab) {
    const session = sessions.get(sender.tab.id);
    if (session && session.id === message.sessionId) {
      sendHost({...message, tabId: sender.tab.id});
    }
  }

  if (message.type === 'action_result' && sender.tab) {
    const session = sessions.get(sender.tab.id);
    if (session && session.id === message.sessionId) sendHost({...message, tabId: sender.tab.id});
  }
});

browser.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
