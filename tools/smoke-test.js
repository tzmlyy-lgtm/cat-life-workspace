/* 冒烟测试：用最小 DOM stub 跑通全部模块渲染、番茄钟逻辑、配色弹窗
   用法：node tools/smoke-test.js （可在任意目录执行） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'life-workspace.html'), 'utf8');
const codes = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!codes.length) { console.error('NO SCRIPT FOUND'); process.exit(1); }

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: i => Object.keys(store)[i]
};

const mkEl = (tag = 'div') => {
  const attrs = {};
  const cls = new Set();
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
    getElementsByTagName() { return []; },
    _attrs: attrs
  };
  el.style.setProperty = () => {};
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  return el;
};

const els = {};
const staticIds = new Set([...src.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const document = {
  documentElement: { setAttribute() {}, getAttribute() { return null; } },
  body: null,
  createElement: t => mkEl(t),
  createElementNS: () => mkEl(),
  getElementById(id) {
    if (els[id]) return els[id];
    if (staticIds.has(id)) { els[id] = mkEl(); els[id].id = id; return els[id]; }
    return null;   // 动态创建的浮层：未创建前为 null（与真实浏览器一致）
  },
  querySelector(sel) {
    if (sel.charAt(0) === '#') return this.getElementById(sel.slice(1));
    return this.getElementById('sel:' + sel);
  },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {}
};
document.body = mkEl('body');
document.body.appendChild = function (c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; };

const intervals = {};
let iid = 0;
const setIntervalStub = (fn) => { const id = ++iid; intervals[id] = fn; return id; };
const clearIntervalStub = (id) => { delete intervals[id]; };
const window = {
  scrollTo() {}, addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage, document
};
const navigator = { clipboard: { writeText() { return Promise.resolve(); } }, vibrate() {} };
const sandbox = {
  console, document, window, navigator, localStorage, store,
  setInterval: setIntervalStub, clearInterval: clearIntervalStub, setTimeout, clearTimeout,
  alert() {}, confirm: () => false, prompt: () => null,
  Blob: function () {}, FileReader: function () {}, Image: function () {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  requestAnimationFrame: fn => setTimeout(fn, 0),
  __out: null
};
sandbox.window.window = sandbox.window;
const testTail = `
;globalThis.__t = { SWITCH: switchTab, MODULES, RENDER, DATA, applyPalette, PALETTES, openPalette, renderHome, aiDailySummary };
`;
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(codes.join('\n') + testTail, ctx, { filename: 'app.js' });
} catch (e) {
  console.error('SCRIPT RUN FAILED:', e && e.stack || e);
  process.exit(1);
}

const T = sandbox.__t;
if (!T) { console.error('EXPORT FAILED'); process.exit(1); }

// 1) 渲染全部模块
let ok = 0;
T.MODULES.forEach(m => {
  try { T.SWITCH(m.id); ok++; } catch (e) { console.error('RENDER FAIL ' + m.id + ':', (e && e.message) || e); }
});
console.log('modules rendered:', ok + '/' + T.MODULES.length);

// 2) 番茄钟：改时长 -> 重置 -> 开始 -> 跑满 -> 触发下一阶段
const pomoStart = document.getElementById('pomoStart');
const ring = document.getElementById('pomoRing');
const runTicks = n => { for (let i = 0; i < n; i++) Object.keys(intervals).forEach(id => intervals[id]()); };
try {
  document.getElementById('pomoWork').value = '1';
  document.getElementById('pomoBreak').value = '1';
  document.getElementById('pomoReset').onclick();   // 应用 1 分钟
  console.log('[pomo] after reset:', document.getElementById('pomoTime').textContent, '| ring:', ring._attrs['stroke-dashoffset']);
  pomoStart.onclick();                               // 开始
  runTicks(30);
  console.log('[pomo] after 30s:', document.getElementById('pomoTime').textContent, '| ring:', ring._attrs['stroke-dashoffset']);
  runTicks(30);                                      // 满 1 分钟 -> 切休息
  console.log('[pomo] after 60s:', document.getElementById('pomoMode').textContent, document.getElementById('pomoTime').textContent, '| start btn:', pomoStart.textContent);
  // 开启自动循环多轮
  document.getElementById('pomoCycle').checked = true;
  document.getElementById('pomoRounds').value = '2';
  document.getElementById('pomoReset').onclick();
  pomoStart.onclick();
  runTicks(60);                                      // 第1轮专注满 -> 休息（自动继续）
  console.log('[pomo] cycle after 60s:', document.getElementById('pomoMode').textContent, document.getElementById('pomoTime').textContent, '| btn:', pomoStart.textContent);
  runTicks(60);                                      // 休息满 -> 第2轮专注
  console.log('[pomo] cycle after 120s:', document.getElementById('pomoMode').textContent, document.getElementById('pomoTime').textContent, '| btn:', pomoStart.textContent);
  runTicks(120);                                     // 第2轮专注+休息结束 -> 收工
  console.log('[pomo] after finish:', document.getElementById('pomoMode').textContent, document.getElementById('pomoTime').textContent, '| btn:', pomoStart.textContent);
  document.getElementById('pomoReset').onclick();
  console.log('[pomo] after reset:', document.getElementById('pomoTime').textContent, '|', document.getElementById('pomoMode').textContent);
} catch (e) { console.error('POMO FAIL:', (e && e.stack) || e); }

// 3) 配色：切换全部，且不输出名称
try {
  T.PALETTES.forEach(p => T.applyPalette(p.id));
  T.openPalette();
  const ov = document.body.children.find(c => c.id === 'paletteMask');
  const grid = ov && ov._q && ov._q['#palGrid'];
  const html = String((grid && grid._html) || '');
  console.log('palette html len:', html.length, '| pal-name in html:', /pal-name/.test(html), '| chips:', (html.match(/pal-chips/g) || []).length);
} catch (e) { console.error('PALETTE FAIL:', (e && e.stack) || e); }

// 4) 纸感背景层存在且颗粒变量可用
const hasPaper = /class="paper"/.test(src) && /\.paper \.pg/.test(src) && /--paper-l:/.test(src) && /--paper-d:/.test(src);
console.log('paper layer present:', hasPaper);

// 5) 模块清单：碎碎念并入树洞 / 月度复盘已移除
const ids = T.MODULES.map(m => m.id).join(',');
console.log('module ids:', ids);
console.log('mood as standalone module removed:', !T.MODULES.some(m => m.id === 'mood'));
console.log('treehole sub mentions 碎碎念:', /碎碎念/.test((T.MODULES.find(m => m.id === 'treehole') || {}).sub || ''));
console.log('RENDER has no renderMood:', !('mood' in T.RENDER), '| renderTreehole:', typeof T.RENDER.treehole);
console.log('月度复盘 removed from source:', !/revSave|revRef|revPlan/.test(codes.join('\n')));

// 6) 书影音：色板为可见色块（非原生下拉）
const booksSrc = codes.join('\n');
console.log('书影音 swatch row present:', /class="sw-row" id="mColorRow"/.test(booksSrc), '| no mColor select:', !/id="mColor"/.test(booksSrc));

// 7) 树洞标签页数量（含碎碎念）
T.SWITCH('treehole');
const thHtml = String((document.getElementById('content') || {})._html || '');
console.log('treehole tabs:', (thHtml.match(/class="tab[ "]/g) || []).length, '| has mood tab:', /data-t="mood"/.test(thHtml));

// 8) 习惯/健康持久化：写入后 localStorage 里有值
try {
  T.SWITCH('fitness');
  document.getElementById('hName').value = '喝水';
  document.getElementById('hMode').value = 'check';
  document.getElementById('btnAddHabit').onclick();
  const kHabits = Object.keys(store).find(k => /_habits$/.test(k));
  const habitsArr = JSON.parse((kHabits && store[kHabits]) || '[]');
  console.log('habits key:', kHabits, '| persisted:', Array.isArray(habitsArr) && habitsArr.length > 0, '| name:', habitsArr[0] && habitsArr[0].name, '| records:', habitsArr[0] && JSON.stringify(habitsArr[0].records));

  document.getElementById('sleep').value = '7.5';
  document.getElementById('weight').value = '52';
  document.getElementById('saveH').onclick();
  const kHealth = Object.keys(store).find(k => /_health$/.test(k));
  const healthObj = JSON.parse((kHealth && store[kHealth]) || '{}');
  const hr = (healthObj.records || [])[0];
  console.log('health key:', kHealth, '| persisted:', Array.isArray(healthObj.records) && healthObj.records.length > 0, '| sleep:', hr && hr.sleep, '| weight:', hr && hr.weight, '| date:', hr && hr.date);
} catch (e) { console.error('FITNESS PERSIST FAIL:', (e && e.stack) || e); }

// 9) 全屏番茄钟：与首页共用同一状态
try {
  T.SWITCH('home');
  const fullBtn = document.getElementById('pomoFull');
  console.log('pomoFull btn wired:', !!(fullBtn && fullBtn.onclick));
  fullBtn.onclick();
  const ov = document.getElementById('fsPomoOverlay');
  console.log('overlay created:', !!ov, '| shown:', !!(ov && ov.classList.contains('show')));
  const fTime = ov.querySelector('#fspTime');
  const fRing = ov.querySelector('#fspRing');
  const pageTime = document.getElementById('pomoTime');
  console.log('mirrors page time on open:', JSON.stringify(pageTime.textContent), '->', JSON.stringify(fTime.textContent), '| match:', pageTime.textContent === fTime.textContent);
  // 从全屏浮层里启动计时（按钮代理到首页）
  ov.querySelector('#fspStart').onclick();
  console.log('after overlay start, page btn:', document.getElementById('pomoStart').textContent, '| overlay btn:', ov.querySelector('#fspStart').textContent);
  runTicks(30);
  console.log('after 30s  page:', pageTime.textContent, '| overlay:', fTime.textContent, '| ring sync:', ring._attrs['stroke-dashoffset'] === fRing._attrs['stroke-dashoffset'], '| fRing off:', fRing._attrs['stroke-dashoffset']);
  // 浮层内重置
  ov.querySelector('#fspReset').onclick();
  console.log('after overlay reset:', pageTime.textContent, '| btn:', document.getElementById('pomoStart').textContent);
  // 关闭
  ov.querySelector('#fspClose').onclick();
  console.log('after close, shown:', ov.classList.contains('show'));
  // 切走再回来：旧浮层应被清理，且不残留第二个计时器
  T.SWITCH('fitness'); T.SWITCH('home');
  console.log('stale overlay cleaned:', !document.getElementById('fsPomoOverlay'), '| timers alive:', Object.keys(intervals).length);
} catch (e) { console.error('FULLSCREEN POMO FAIL:', (e && e.stack) || e); }

// 10) 番茄钟使用记录：跑完专注阶段自动落盘 + 统计渲染 + 进入一日总结
try {
  T.SWITCH('home');
  const kPomo = () => Object.keys(store).find(k => /_pomo$/.test(k));
  const readPomo = () => JSON.parse((kPomo() && store[kPomo()]) || '[]');
  const before = readPomo().length;

  document.getElementById('pomoWork').value = '1';
  document.getElementById('pomoBreak').value = '1';
  document.getElementById('pomoCycle').checked = false;
  document.getElementById('pomoReset').onclick();
  pomoStart.onclick();
  runTicks(60);                                  // 跑满 1 分钟专注 → 完成
  const after = readPomo();
  const last = after[0] || {};
  const today = new Date();
  const ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  console.log('pomo storage key:', kPomo(), '| records:', before, '->', after.length, '| +1:', after.length === before + 1);
  console.log('record fields: date=' + last.date, 'kind=' + last.kind, 'min=' + last.min, 'at=' + last.at,
    '| valid:', last.date === ymd && last.kind === 'work' && last.min === 1 && /^\d{2}:\d{2}$/.test(String(last.at)));
  // 休息阶段不应产生记录
  pomoStart.onclick(); runTicks(60);             // 休息满 → 不记录
  console.log('break phase adds no record:', readPomo().length === after.length);
  // 统计渲染
  const stats = String(document.getElementById('pomoStats').innerHTML || '');
  const todayN = readPomo().filter(r => r.date === ymd).length;
  console.log('stats rendered:', stats.length > 0, '| 今日数值正确:', stats.includes('今日 <b>' + todayN + '</b> 个'), '| 有近7天:', stats.includes('近 7 天'));
  // 全屏浮层里的统计行同步
  document.getElementById('pomoFull').onclick();
  const fsStat = document.getElementById('fsPomoOverlay').querySelector('#fspStat');
  console.log('fullscreen stat synced:', /今日 \d+ 个番茄/.test(String(fsStat.textContent)));
  document.getElementById('pomoFull').onclick && window.closeFullPomo && window.closeFullPomo();
  // 进入一日总结
  T.aiDailySummary();
  const aiTx = String(document.getElementById('aiText').value || '');
  console.log('AI summary mentions 专注:', aiTx.includes('【专注】'), '| sample:', (aiTx.split('\n').find(l => l.indexOf('【专注】') === 0) || '(none)').slice(0, 46));
} catch (e) { console.error('POMO RECORD FAIL:', (e && e.stack) || e); }

// 11) 修复验证：切模块不丢专注（状态持久化）
try {
  T.SWITCH('home');
  document.getElementById('pomoWork').value = '1';
  document.getElementById('pomoBreak').value = '1';
  document.getElementById('pomoCycle').checked = false;
  document.getElementById('pomoReset').onclick();
  pomoStart.onclick();
  runTicks(20);                                  // 跑 20 秒 → 剩 40 秒
  console.log('[persist] before switch:', document.getElementById('pomoTime').textContent, '| btn:', pomoStart.textContent);
  T.SWITCH('fitness');                           // 切走
  const midTime = document.getElementById('pomoTime').textContent;
  T.SWITCH('home');                              // 切回
  const backTx = document.getElementById('pomoTime').textContent;
  const backSec = (function (t) { const m = String(t).split(':'); return (+m[0]) * 60 + (+m[1]); })(backTx);
  console.log('[persist] after switch back:', backTx, '| btn:', pomoStart.textContent,
    '| resumed (非重置):', backSec > 0 && backSec <= 41, '| still running:', pomoStart.textContent === '暂停');
  // 恢复后能正常跑完并落记录
  const kPomo2 = Object.keys(store).find(k => /_pomo$/.test(k));
  const nBefore = JSON.parse(store[kPomo2] || '[]').length;
  runTicks(45);
  const nAfter = JSON.parse(store[kPomo2] || '[]').length;
  console.log('[persist] 恢复后可正常完成并记录:', nBefore, '->', nAfter, '| ok:', nAfter === nBefore + 1);
  // 暂停状态也应保留
  pomoStart.onclick();                           // 暂停（当前应在休息阶段，同样适用）
  const pausedLabel = pomoStart.textContent;
  T.SWITCH('fitness'); T.SWITCH('home');
  console.log('[persist] 暂停状态保留:', '切走前=' + JSON.stringify(pausedLabel), '切回后=' + JSON.stringify(pomoStart.textContent),
    '| ok:', pausedLabel === pomoStart.textContent);
  document.getElementById('pomoReset').onclick();
} catch (e) { console.error('PERSIST FAIL:', (e && e.stack) || e); }

// 12) 任务维度：专注记录带任务名 + 任务投入排行
try {
  T.SWITCH('home');
  document.getElementById('pomoWork').value = '1';
  document.getElementById('pomoBreak').value = '1';
  document.getElementById('pomoCycle').checked = false;
  const ti = document.getElementById('pomoTask');
  ti.value = '写毕业论文';
  document.getElementById('pomoReset').onclick();
  pomoStart.onclick();
  runTicks(60);                                  // 完成一个带任务的专注
  const kPomo3 = Object.keys(store).find(k => /_pomo$/.test(k));
  const recs = JSON.parse(store[kPomo3] || '[]');
  console.log('任务名写入记录:', JSON.stringify(recs[0] && recs[0].task), '| ok:', (recs[0] || {}).task === '写毕业论文');
  const st = String(document.getElementById('pomoStats').innerHTML || '');
  console.log('任务投入排行渲染:', st.includes('任务投入 TOP'), '| 含任务名:', st.includes('写毕业论文'));
  const dl = String(document.getElementById('pomoTaskList').innerHTML || '');
  console.log('任务名进入候选列表:', dl.includes('写毕业论文'));
  // 全屏浮层显示当前任务（必须在「专注模式 + 已开始」下才有值）
  ti.value = '写论文第2章';
  document.getElementById('pomoReset').onclick();   // 回到专注起点
  pomoStart.onclick();                               // 开始 → 读取任务名
  document.getElementById('pomoFull').onclick();
  const fspTask = String(document.getElementById('fsPomoOverlay').querySelector('#fspTask').textContent || '');
  console.log('全屏浮层任务行:', JSON.stringify(fspTask), '| ok:', fspTask === '写论文第2章');
  if (window.closeFullPomo) window.closeFullPomo();
  document.getElementById('pomoReset').onclick();
  // 一日总结应带上「主要投入在哪个任务」
  T.aiDailySummary();
  const ai2 = String(document.getElementById('aiText').value || '');
  const line2 = ai2.split('\n').find(l => l.indexOf('【专注】') === 0) || '';
  console.log('一日总结含任务归因:', line2.includes('主要投入在'), '|', line2.slice(0, 62));
} catch (e) { console.error('TASK DIM FAIL:', (e && e.stack) || e); }

console.log('SMOKE_DONE');
