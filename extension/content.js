function snapshot() {
  const fields = [...document.querySelectorAll('input, textarea, select')]
    .filter((field) => field.type !== 'password')
    .slice(0, 100)
    .map((field) => ({
      tag: field.tagName.toLowerCase(),
      type: field.type || null,
      name: field.name || null,
      id: field.id || null,
      label: field.labels?.[0]?.innerText?.trim() || null
    }));
  return {
    title: document.title,
    url: location.href,
    selection: String(getSelection() || '').slice(0, 2000),
    text: (document.body?.innerText || '').slice(0, 8000),
    fields
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'snapshot') {
    browser.runtime.sendMessage({type: 'snapshot', sessionId: message.sessionId, snapshot: snapshot()});
  }
});
