/* 新闻源验证：在真实网络环境下跑 fetchLiveNews()，确认数据源可达且解析正确
   用法：node tools/news-check.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'life-workspace.html'), 'utf8');
const code = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => {}, length: 0, key: () => null };
const mkEl = () => {
  const el = { id: '', className: '', _html: '', textContent: '', value: '', dataset: {}, style: {}, children: [], files: [], checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    focus() {}, blur() {}, click() {}, setSelectionRange() {}, scrollIntoView() {},
    querySelector(s) { this._q = this._q || {}; if (!this._q[s]) this._q[s] = mkEl(); return this._q[s]; },
    querySelectorAll() { return []; }, closest() { return mkEl(); }, contains() { return false; }, getElementsByTagName() { return []; } };
  el.style.setProperty = () => {};
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  return el;
};
const els = {};
const staticIds = new Set([...src.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const document = {
  documentElement: { setAttribute() {}, getAttribute() { return null; } }, body: mkEl('body'),
  createElement: () => mkEl(), createElementNS: () => mkEl(),
  getElementById(id) { if (els[id]) return els[id]; if (staticIds.has(id)) { els[id] = mkEl(); els[id].id = id; return els[id]; } return null; },
  querySelector(s) { return s[0] === '#' ? this.getElementById(s.slice(1)) : this.getElementById('sel:' + s); },
  querySelectorAll() { return []; }, addEventListener() {}, removeEventListener() {}
};
const sandbox = {
  console, document, localStorage, store,
  window: { scrollTo() {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), localStorage, document },
  navigator: { clipboard: { writeText: () => Promise.resolve() }, vibrate() {} },
  setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
  alert() {}, confirm: () => false, prompt: () => null,
  Blob: function () {}, FileReader: function () {}, Image: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  requestAnimationFrame: fn => setTimeout(fn, 0),
  fetch, AbortController, __out: null
};
sandbox.window.window = sandbox.window;
vm.runInContext(code + '\n;globalThis.__t={fetchLiveNews,readNewsCache,writeNewsCache,renderNews,switchTab};', vm.createContext(sandbox), { filename: 'app.js' });

(async () => {
  const T = sandbox.__t;
  const res = await T.fetchLiveNews();
  if (!res) { console.log('RESULT: null (all sources failed)'); return; }
  console.log('source:', res.src, '| items:', res.items.length);
  res.items.slice(0, 4).forEach((n, i) => console.log(`  ${i + 1}. [${n.c}] ${n.d} ${n.t.slice(0, 46)}`));
  T.writeNewsCache(res);
  console.log('cached:', !!T.readNewsCache());
  T.switchTab('news');
  const html = String(document.getElementById('newsBox')._html || '');
  console.log('newsBox rendered chars:', html.length, '| has live links:', /target="_blank"/.test(html));
})();
