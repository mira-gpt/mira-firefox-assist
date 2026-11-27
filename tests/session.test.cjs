const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('YOLO stays active without a timer and revoke rejects further actions', async () => {
  let receive, hostMessage, disconnect, closedTab;
  const sentToTab = [];
  const sentToHost = [];
  const host = {
    onMessage: { addListener(fn) { hostMessage = fn; } },
    onDisconnect: { addListener(fn) { disconnect = fn; } },
    postMessage(message) { sentToHost.push(message); },
  };
  const browser = {
    runtime: {
      connectNative() { queueMicrotask(() => hostMessage({type: 'host_ready'})); return host; },
      onMessage: { addListener(fn) { receive = fn; } },
      sendMessage: async () => {},
    },
    scripting: { executeScript: async () => {} },
    tabs: {
      sendMessage: async (tab, message) => { sentToTab.push({tab, message}); },
      onRemoved: { addListener(fn) { closedTab = fn; } },
      onUpdated: { addListener() {} },
    },
    webNavigation: { onCommitted: { addListener() {} } },
  };
  const timers = [];
  const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
  vm.runInNewContext(source, {browser, crypto: {randomUUID: () => 'session-1'}, console,
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; }});
  await assert.rejects(receive({type: 'start', tabId: 7, yolo: true}, {}), /acknowledgement/);
  await receive({type: 'start', tabId: 7, request: 'test', yolo: true, yoloRiskAccepted: true}, {});
  assert.equal((await receive({type: 'status', tabId: 7}, {})).yolo, true);
  assert.equal(timers.length, 0, 'an active session has no expiry timer');
  await receive({type: 'set_control', tabId: 7, humanControl: true}, {});
  assert.equal((await receive({type: 'status', tabId: 7}, {})).humanControl, true);
  const beforePause = sentToTab.length;
  await hostMessage({type: 'action_request', sessionId: 'session-1', action: {kind: 'click'}});
  assert.equal(sentToTab.length, beforePause, 'human control blocks dispatch');
  assert.equal(sentToHost.at(-1).result.reason, 'human_control');
  await receive({type: 'set_control', tabId: 7, humanControl: false}, {});
  await hostMessage({type: 'action_request', sessionId: 'session-1', action: {kind: 'click'}});
  assert.equal(sentToTab.at(-1).message.type, 'action_request', 'resume allows new actions');
  disconnect();
  assert.equal(timers[0].ms, 3000, 'disconnected host schedules reconnect');
  await receive({type: 'stop_current_session', sessionId: 'session-1'}, {tab: {id: 7}});
  assert.equal((await receive({type: 'status', tabId: 7}, {})).active, false);
  const before = sentToTab.length;
  await hostMessage({type: 'action_request', sessionId: 'session-1', action: {kind: 'click'}});
  assert.equal(sentToTab.length, before, 'revoked session cannot dispatch an action');
  closedTab(7);
});

test('new window starts a session only after matching permitted origin loads', async () => {
  let receive, hostMessage;
  const sent = [];
  let tab = {id: 9, status: 'loading', url: 'https://example.com/'};
  const host = {onMessage: {addListener(fn) {hostMessage = fn;}}, onDisconnect: {addListener() {}}, postMessage(m) {sent.push(m);}};
  const browser = {
    runtime: {connectNative() {queueMicrotask(() => hostMessage({type: 'host_ready'})); return host;},
      onMessage: {addListener(fn) {receive = fn;}}, sendMessage: async () => {}},
    permissions: {contains: async () => true},
    windows: {create: async () => ({tabs: [tab]})},
    scripting: {executeScript: async () => {}},
    tabs: {get: async () => tab, sendMessage: async () => {},
      onRemoved: {addListener() {}}, onUpdated: {addListener(fn) {this.listener = fn;}}},
    webNavigation: {onCommitted: {addListener() {}}},
  };
  const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
  vm.runInNewContext(source, {browser, URL, crypto: {randomUUID: () => 'new-session'}, console, setTimeout});
  await receive({type: 'open_window', url: 'https://example.com/', request: 'inspect'}, {});
  assert.equal(sent.some(m => m.type === 'session_started'), false);
  tab = {...tab, status: 'complete'};
  await browser.tabs.onUpdated.listener(9, {status: 'complete'});
  assert.equal(sent.some(m => m.type === 'session_started' && m.sessionId === 'new-session'), true);
});
