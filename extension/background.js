const HOST = 'org.mira.firefox_assist';
const sessions = new Map();
let host = null;
let hostState = 'disconnected';
let hostError = '';
let hostReady = null;
let resolveHostReady = null;
let rejectHostReady = null;
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer || !sessions.size) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!sessions.size || host) return;
    try {
      await sendHost({type: 'probe'});
      for (const tabId of sessions.keys()) notifyPopup(tabId);
    } catch (error) {
      console.warn('Firefox Assist reconnect failed:', error);
      scheduleReconnect();
    }
  }, 3000);
}

function appendMessage(session, role, text) {
  if (!session || !text) return;
  session.messages ??= [];
  session.messages.push({role, text: String(text).slice(0, 4000), time: new Date().toISOString()});
  if (session.messages.length > 100) session.messages.shift();
}

function notifyPopup(tabId) {
  browser.runtime.sendMessage({type: 'assist_feedback', tabId}).catch(() => {});
}

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
    for (const tabId of sessions.keys()) notifyPopup(tabId);
    scheduleReconnect();
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
    await browser.tabs.sendMessage(tabId, {type: 'snapshot', sessionId: session.id, yolo: session.yolo, humanControl: session.humanControl});
  }
  if (message.type === 'action_request') {
    if (session.humanControl) {
      await sendHost({type: 'action_result', sessionId: session.id, tabId, frameId: message.frameId,
        result: {ok: false, reason: 'human_control'}});
      return;
    }
    try {
      await browser.tabs.sendMessage(tabId, {
        type: 'action_request', sessionId: session.id, action: message.action, yolo: session.yolo
      }, message.frameId === undefined ? undefined : {frameId: message.frameId});
    } catch (error) {
      // A rejected frame delivery must not silently consume a reviewed action.
      // Report it through the normal result path so Mira can distinguish it
      // from a user denial or a page-side failure.
      await sendHost({
        type: 'action_result', sessionId: session.id, tabId, frameId: message.frameId,
        result: {ok: false, reason: `action_delivery_failed:${String(error)}`},
      });
    }
  }
  if (message.type === 'assist_feedback') {
    appendMessage(session, 'assistant', message.text);
    if (message.state) session.assistantState = message.state;
    notifyPopup(tabId);
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === 'status') {
    const session = sessions.get(message.tabId);
    return {
      active: Boolean(session), yolo: Boolean(session?.yolo), humanControl: Boolean(session?.humanControl), hostState, hostError,
      messages: session?.messages || [], assistantState: session?.assistantState || '',
    };
  }

  if (message.type === 'start') {
    if (message.yolo === true && message.yoloRiskAccepted !== true) {
      throw new Error('YOLO risk acknowledgement is required.');
    }
    await sendHost({type: 'probe'});
    await inject(message.tabId);
    const previous = sessions.get(message.tabId);
    if (previous) {
      await sendHost({type: 'session_stopped', sessionId: previous.id, tabId: message.tabId});
    }
    const id = crypto.randomUUID();
    const session = {id, yolo: message.yolo === true, humanControl: false, messages: []};
    appendMessage(session, 'user', message.request || 'Please inspect this tab.');
    sessions.set(message.tabId, session);
    await sendHost({type: 'session_started', sessionId: id, tabId: message.tabId, request: message.request || '', yolo: session.yolo});
    await browser.tabs.sendMessage(message.tabId, {type: 'snapshot', sessionId: id, yolo: session.yolo, humanControl: false});
    return {active: true};
  }

  if (message.type === 'stop') {
    const session = sessions.get(message.tabId);
    sessions.delete(message.tabId);
    if (session) {
      browser.tabs.sendMessage(message.tabId, {type: 'session_stopped', sessionId: session.id}).catch(() => {});
      await sendHost({type: 'session_stopped', sessionId: session.id, tabId: message.tabId});
    }
    return {active: false};
  }

  if (message.type === 'stop_current_session' && sender.tab) {
    const session = sessions.get(sender.tab.id);
    if (!session || session.id !== message.sessionId) return;
    sessions.delete(sender.tab.id);
    browser.tabs.sendMessage(sender.tab.id, {type: 'session_stopped', sessionId: session.id}).catch(() => {});
    await sendHost({type: 'session_stopped', sessionId: session.id, tabId: sender.tab.id});
    notifyPopup(sender.tab.id);
    return {active: false};
  }

  if (message.type === 'set_control') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;
    const session = sessions.get(tabId);
    if (!session || (sender.tab && session.id !== message.sessionId)) return;
    session.humanControl = message.humanControl === true;
    await browser.tabs.sendMessage(tabId, {type: 'control_changed', sessionId: session.id,
      yolo: session.yolo, humanControl: session.humanControl});
    await sendHost({type: 'control_state', sessionId: session.id, tabId,
      humanControl: session.humanControl});
    notifyPopup(tabId);
    return {humanControl: session.humanControl};
  }

  if (message.type === 'user_note') {
    const session = sessions.get(message.tabId);
    if (!session) throw new Error('This tab is not currently shared.');
    appendMessage(session, 'user', message.text);
    await sendHost({type: 'user_note', sessionId: session.id, tabId: message.tabId, text: String(message.text).slice(0, 4000)});
    notifyPopup(message.tabId);
    return {active: true};
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

browser.tabs.onRemoved.addListener((tabId) => {
  const session = sessions.get(tabId);
  sessions.delete(tabId);
  if (session) sendHost({type: 'session_stopped', sessionId: session.id, tabId}).catch(() => {});
});

browser.webNavigation.onCommitted.addListener(async (details) => {
  const session = sessions.get(details.tabId);
  if (!session) return;
  try {
    await injectFrame(details.tabId, details.frameId);
    await browser.tabs.sendMessage(details.tabId, {
      type: 'snapshot', sessionId: session.id, yolo: session.yolo, humanControl: session.humanControl,
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
      type: 'snapshot', sessionId: session.id, yolo: session.yolo, humanControl: session.humanControl,
    });
  } catch (error) {
    console.debug('Could not refresh assisted tab:', error);
  }
});
