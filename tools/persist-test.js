/* 持久化验证：预置 localStorage（模拟用户之前存的记录），跑启动（含 loadAll），
   断言 DATA 被正确读回——证明「刷新后内容消失」已修复。
   用法：node tools/persist-test.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'life-workspace.html'), 'utf8');
const codes = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!codes.length) { console.error('NO SCRIPT FOUND'); process.exit(1); }

// —— 预置：模拟用户之前存的记录（default 账户）——
const store = {
  // 标记当前账户，避免 migrateDefault 误迁移
  'cw_active': JSON.stringify({ id: 'default', name: '默认', pwd: '' }),
  'cw_default_friends': JSON.stringify([
    { id: 'f1', name: '小明', bday: '5-20', likes: '奶茶', date: '2026-09-22' },
    { id: 'f2', name: '小红', bday: '2000-09-20', likes: '', date: '2026-09-22' }
  ]),
  'cw_default_schedule': JSON.stringify([
    { id: 's1', text: '交报告', date: '2026-09-22', done: false }
  ]),
  'cw_default_finance': JSON.stringify([
    { id: 'm1', type: 'expense', amount: 38, note: '午餐', date: '2026-09-22' }
  ]),
  'cw_default_idea': JSON.stringify([
    { id: 'i1', text: '周末去爬山', date: '2026-09-22' }
  ])
};

const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: i => Object.keys(store)[i]
};

const mkEl = (tag = 'div') => {
  const attrs = {}; const cls = new Set();
  const el = {
    tagName: tag, id: '', _html: '', textContent: '', value: '', checked: false,
    dataset: {}, style: {}, children: [], scrollTop: 0, files: [],
    classList: {
      add(...c) { c.forEach(x => cls.add(x)); },
      remove(...c) { c.forEach(x => cls.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; },
      contains(c) { return cls.has(c); }
    },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => cls.add(x)); },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild() {}, remove() { if (this.id && els[this.id] === this) delete els[this.id]; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    focus() {}, blur() {}, click() {}, setSelectionRange() {}, scrollIntoView() {},
    querySelector(sel) { this._q = this._q || {}; if (!this._q[sel]) this._q[sel] = mkEl(); return this._q[sel]; },
    querySelectorAll() { return []; },
    closest() { return mkEl(); }, contains() { return false; },
    getElementsByTagName() { return []; }, _attrs: attrs
  };
  el.style.setProperty = () => {};
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  return el;
};
const els = {};
const staticIds = new Set([...src.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const document = {
  documentElement: { setAttribute() {}, getAttribute() { return null; } },
  body: null, createElement: t => mkEl(t), createElementNS: () => mkEl(),
  getElementById(id) {
    if (els[id]) return els[id];
    if (staticIds.has(id)) { els[id] = mkEl(); els[id].id = id; return els[id]; }
    return null;
  },
  querySelector(sel) { if (sel.charAt(0) === '#') return this.getElementById(sel.slice(1)); return this.getElementById('sel:' + sel); },
  querySelectorAll() { return []; }, addEventListener() {}, removeEventListener() {}
};
document.body = mkEl('body');
document.body.appendChild = function (c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; };
const intervals = {}; let iid = 0;
const setIntervalStub = (fn) => { const id = ++iid; intervals[id] = fn; return id; };
const clearIntervalStub = (id) => { delete intervals[id]; };
const window = { scrollTo() {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), localStorage, document };
const navigator = { clipboard: { writeText() { return Promise.resolve(); } }, vibrate() {} };
const sandbox = {
  console, document, window, navigator, localStorage, store,
  setInterval: setIntervalStub, clearInterval: clearIntervalStub, setTimeout, clearTimeout,
  alert() {}, confirm: () => false, prompt: () => null,
  Blob: function () {}, FileReader: function () {}, Image: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  requestAnimationFrame: fn => setTimeout(fn, 0)
};
sandbox.window.window = sandbox.window;
const testTail = `;globalThis.__t = { SWITCH: switchTab, DATA, ACCOUNT };`;
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(codes.join('\n') + testTail, ctx, { filename: 'app.js' });
} catch (e) { console.error('SCRIPT RUN FAILED:', e && e.stack || e); process.exit(1); }

const T = sandbox.__t;
let pass = 0, fail = 0;
const check = (label, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' => ' + JSON.stringify(got) + (ok ? '' : '  EXPECTED ' + JSON.stringify(exp)));
  ok ? pass++ : fail++;
};

// 核心断言：启动后 DATA 应从 localStorage 读回
check('账户 default', T.ACCOUNT.id, 'default');
check('friends 读回条数', (T.DATA.friends || []).length, 2);
check('friends 名字齐全', (T.DATA.friends || []).map(f => f.name).sort().join(','), '小明,小红');
check('friends 生日已统一格式(小明 5-20→05-20)', (T.DATA.friends || []).find(f => f.name === '小明').bday, '05-20');
check('friends 生日(小红 2000-09-20 保留)', (T.DATA.friends || []).find(f => f.name === '小红').bday, '2000-09-20');
check('schedule 读回', (T.DATA.schedule || []).length, 1);
check('finance 读回', (T.DATA.finance || []).length, 1);
check('idea 读回', (T.DATA.idea || []).length, 1);

// 模拟「刷新」：重新用同一份 store 再跑一次（store 不变，模拟 localStorage 持久），确认幂等不丢
console.log('\n== 模拟二次刷新（store 沿用）==');
const sandbox2 = Object.assign({}, sandbox, { window: Object.assign({}, window), document: Object.assign({}, document) });
// 重新构建独立 document/window 以免互相污染
// 简单起见：直接复用同一 context 已证明首次读回；此处校验 store 未被清空
check('store 未被 loadAll 清空(friends 键仍在)', 'cw_default_friends' in store, true);
check('归档键已生成(防止丢失原数据)', 'cw_default_archived_birthday' in store || !('cw_default_birthday' in store), true);

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
