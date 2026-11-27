const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(items) {
  const document = {
    addEventListener() {}, documentElement: {},
    querySelectorAll() { return items; },
  };
  const sandbox = {document, window: {}, console, URL,
    MutationObserver: class { observe() {} },
    browser: {runtime: {onMessage: {addListener() {}}, sendMessage: async () => {}}},
    setTimeout(fn) { fn(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8'), sandbox);
  vm.runInContext('activeSessionId = "test"', sandbox);
  return sandbox;
}

function button(label) {
  return {innerText: label, style: {}, disabled: false, clicks: 0,
    getClientRects: () => [1], getAttribute: () => null, click() {this.clicks++;}};
}

test('click-text clicks a unique matching visible control', async () => {
  const item = button('Catalog');
  const sandbox = setup([item]);
  const result = await vm.runInContext('perform({kind: "click_text", text: "Catalog"}, true)', sandbox);
  assert.equal(result.ok, true);
  assert.equal(item.clicks, 1);
});

test('click-text refuses ambiguous or missing labels', async () => {
  const a = button('Catalog'), b = button('Catalog');
  const sandbox = setup([a, b]);
  const duplicate = await vm.runInContext('perform({kind: "click_text", text: "Catalog"}, true)', sandbox);
  const missing = await vm.runInContext('perform({kind: "click_text", text: "Other"}, true)', sandbox);
  assert.equal(duplicate.reason, 'ambiguous_label');
  assert.equal(missing.reason, 'element_unavailable');
  assert.equal(a.clicks + b.clicks, 0);
});

test('highlight outlines one visible element without clicking and restores its style', async () => {
  const item = button('Catalog');
  item.style.outline = '1px solid red';
  const sandbox = setup([item]);
  const result = await vm.runInContext('perform({kind: "highlight", selector: "#catalog"}, false)', sandbox);
  assert.equal(result.ok, true);
  assert.equal(item.style.outline, '1px solid red');
  assert.equal(item.clicks, 0);
});

test('highlight refuses missing or ambiguous elements', async () => {
  const sandbox = setup([button('One'), button('Two')]);
  const result = await vm.runInContext('perform({kind: "highlight", selector: "button"}, false)', sandbox);
  assert.equal(result.reason, 'ambiguous_selector');
  const missing = setup([]);
  const absent = await vm.runInContext('perform({kind: "highlight", selector: "#missing"}, false)', missing);
  assert.equal(absent.reason, 'element_unavailable');
});
