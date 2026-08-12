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
  await browser.scripting.executeScript({
    target: {tabId, allFrames: true},
    files: ['content.js'],
  });
}

async function injectFrame(tabId, frameId) {
  await browser.scripting.executeScript({
    target: {tabId, frameIds: [frameId]},
    files: ['content.js'],
  });
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
    }, message.frameId === undefined ? undefined : {frameId: message.frameId});
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
      await sendHost({...message, tabId: sender.tab.id, frameId: sender.frameId});
    }
  }

  if (message.type === 'action_result' && sender.tab) {
    const session = sessions.get(sender.tab.id);
    if (session && session.id === message.sessionId) {
      await sendHost({...message, tabId: sender.tab.id, frameId: sender.frameId});
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));

browser.webNavigation.onCommitted.addListener(async (details) => {
  const session = sessions.get(details.tabId);
  if (!session) return;
  try {
    await injectFrame(details.tabId, details.frameId);
    await browser.tabs.sendMessage(details.tabId, {
      type: 'snapshot', sessionId: session.id,
    }, {frameId: details.frameId});
  } catch (error) {
    console.debug('Could not refresh assisted frame:', error);
  }
});

// The navigation event is early on some old framed pages. A completed-tab
// fallback makes sure an explicitly assisted same-origin page is captured
// again after its document and child frames have settled.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const session = sessions.get(tabId);
  if (!session) return;
  try {
    await inject(tabId);
    await browser.tabs.sendMessage(tabId, {
      type: 'snapshot', sessionId: session.id,
    });
  } catch (error) {
    console.debug('Could not refresh assisted tab:', error);
  }
});
