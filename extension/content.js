const MAX_SOURCE_BYTES = 250_000;
const MAX_EVENT_LOG = 100;
const eventLog = [];

function trim(value, limit) {
  return String(value || '').slice(0, limit);
}

function elementInfo(element) {
  if (!(element instanceof Element)) return {tag: null};
  return {
    tag: element.tagName.toLowerCase(), id: element.id || null,
    name: element.getAttribute('name'), type: element.getAttribute('type'),
    selector: element.id ? `#${CSS.escape(element.id)}` : element.tagName.toLowerCase()
  };
}

function rememberEvent(event) {
  const target = elementInfo(event.target);
  if (target.type === 'password') return;
  eventLog.push({type: event.type, target, time: new Date().toISOString()});
  if (eventLog.length > MAX_EVENT_LOG) eventLog.shift();
}

for (const type of ['click', 'change', 'input', 'submit', 'keydown']) {
  document.addEventListener(type, rememberEvent, true);
}

function snapshot() {
  const fields = [...document.querySelectorAll('input, textarea, select')]
    .filter((field) => field.type !== 'password').slice(0, 100)
    .map((field) => ({...elementInfo(field), label: trim(field.labels?.[0]?.innerText, 200)}));
  const scripts = [...document.scripts].slice(0, 100).map((script) => ({
    src: script.src || null, type: script.type || 'text/javascript',
    inline: !script.src, chars: script.src ? 0 : script.textContent.length
  }));
  const inlineHandlers = [...document.querySelectorAll('*')].flatMap((element) =>
    [...element.attributes].filter((attr) => attr.name.startsWith('on')).map((attr) => ({
      target: elementInfo(element), event: attr.name, source: trim(attr.value, 1000)
    }))).slice(0, 100);
  return {
    title: document.title, url: location.href,
    selection: trim(getSelection(), 2000), text: trim(document.body?.innerText, 8000),
    source: trim(document.documentElement?.outerHTML, MAX_SOURCE_BYTES),
    sourceTruncated: (document.documentElement?.outerHTML.length || 0) > MAX_SOURCE_BYTES,
    fields, scripts, inlineHandlers, observedEvents: eventLog
  };
}

function confirmAction(action) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483647;inset:0;display:grid;place-items:center;background:#0009;color:#fff;font:16px sans-serif';
    const panel = document.createElement('div');
    panel.style.cssText = 'max-width:620px;padding:22px;background:#242424;border:2px solid #8d65ff;border-radius:10px';
    panel.innerHTML = `<strong>Mira Firefox Assist requests an action</strong><pre style="white-space:pre-wrap;max-height:220px;overflow:auto">${JSON.stringify(action, null, 2).replaceAll('<', '&lt;')}</pre>`;
    const allow = document.createElement('button'); allow.textContent = 'Allow once';
    const deny = document.createElement('button'); deny.textContent = 'Cancel';
    allow.onclick = () => { box.remove(); resolve(true); };
    deny.onclick = () => { box.remove(); resolve(false); };
    panel.append(allow, deny); box.append(panel); document.documentElement.append(box);
  });
}

async function perform(action) {
  if (!await confirmAction(action)) return {ok: false, reason: 'denied'};
  if (action.kind === 'input') {
    const field = document.querySelector(action.selector);
    if (!field || field.type === 'password') return {ok: false, reason: 'field_unavailable'};
    field.focus(); field.value = String(action.text || '');
    field.dispatchEvent(new Event('input', {bubbles: true}));
    field.dispatchEvent(new Event('change', {bubbles: true}));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {ok: true, kind: 'input'};
  }
  if (action.kind === 'navigate') {
    const url = new URL(String(action.url || ''), location.href);
    if (url.origin !== location.origin) return {ok: false, reason: 'cross_origin_navigation_blocked'};
    location.assign(url.href);
    return {ok: true, kind: 'navigate', url: url.href};
  }
  if (action.kind === 'click') {
    const element = document.querySelector(action.selector);
    if (!element) return {ok: false, reason: 'element_unavailable'};
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {ok: true, kind: 'click'};
  }
  if (action.kind === 'script') {
    // Runs only after an in-page visible approval. This is a page-DOM helper,
    // not a bypass for browser or site permissions.
    await Function(`"use strict"; return (async () => { ${action.source} })();`)();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {ok: true, kind: 'script'};
  }
  return {ok: false, reason: 'unsupported_action'};
}

browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'snapshot') {
    browser.runtime.sendMessage({type: 'snapshot', sessionId: message.sessionId, snapshot: snapshot()});
  }
  if (message.type === 'action_request') {
    try {
      const result = await perform(message.action);
      browser.runtime.sendMessage({type: 'action_result', sessionId: message.sessionId, result});
    } catch (error) {
      browser.runtime.sendMessage({type: 'action_result', sessionId: message.sessionId, result: {ok: false, reason: String(error)}});
    }
  }
});
