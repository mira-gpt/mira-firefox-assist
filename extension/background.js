const HOST = 'org.mira.firefox_assist';
const sessions = new Map();
let host = null;
let hostState = 'disconnected';
let hostError = '';
let hostReady = null;
let resolveHostReady = null;
let rejectHostReady = null;

function connectHost() {
  if (host) return host;
  host = browser.runtime.connectNative(HOST);
  hostState = 'connecting';
  hostError = '';
  hostReady = new Promise((resolve, reject) => {
    resolveHostReady = resolve;
    rejectHostReady = reject;
  });
  host.onMessage.addListener(async (message) => {
    if (message.type === 'host_ready') {
      hostState = 'connected';
      resolveHostReady?.();
      return;
    }
    await handleHostMessage(message);
  });
  host.onDisconnect.addListener(() => {
    hostError = browser.runtime.lastError?.message || 'Native host disconnected.';
    hostState = 'disconnected';
    rejectHostReady?.(new Error(hostError));
    host = null;
  });
  return host;
}

async function sendHost(message) {
  connectHost();
  await hostReady;
  host.postMessage(message);
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
  if (message.type === 'status') {
    return {active: sessions.has(message.tabId), hostState, hostError};
  }

  if (message.type === 'start') {
    await sendHost({type: 'probe'});
    await inject(message.tabId);
    const id = crypto.randomUUID();
    sessions.set(message.tabId, {id});
    await sendHost({type: 'session_started', sessionId: id, tabId: message.tabId, request: message.request || ''});
    await browser.tabs.sendMessage(message.tabId, {type: 'snapshot', sessionId: id});
    return {active: true};
  }

  if (message.type === 'stop') {
    const session = sessions.get(message.tabId);
    if (session) await sendHost({type: 'session_stopped', sessionId: session.id, tabId: message.tabId});
    sessions.delete(message.tabId);
    return {active: false};
  }

  if (message.type === 'snapshot' && sender.tab) {
    const session = sessions.get(sender.tab.id);
    if (session && session.id === message.sessionId) {
      await sendHost({...message, tabId: sender.tab.id});
    }
  }

  if (message.type === 'action_result' && sender.tab) {
    const session = sessions.get(sender.tab.id);
    if (session && session.id === message.sessionId) await sendHost({...message, tabId: sender.tab.id});
  }
});

browser.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
