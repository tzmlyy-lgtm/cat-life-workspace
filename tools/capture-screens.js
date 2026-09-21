/* 用 Chrome DevTools Protocol 驱动无头 Edge，截取多个模块的界面图
   用法：node tools/capture-screens.js <站点URL>
   依赖：Node 18+ 自带 fetch 与 WebSocket，无需安装任何包 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_TARGET = process.argv[2] || 'https://467a60c30d154957b7c0cf35092bdde4.app.workbuddy.host/';
const OUT = path.join(__dirname, '..', 'assets');
const PORT = 9222;
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const exe = EDGE_CANDIDATES.find(p => fs.existsSync(p));
  if (!exe) { console.error('未找到 Edge / Chrome'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(os.tmpdir(), 'catshot-' + Date.now());

  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });

  // 等调试端口就绪
  let ws = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) { ws = page.webSocketDebuggerUrl; break; }
    } catch (e) { /* 继续等 */ }
  }
  if (!ws) { console.error('调试端口未就绪'); child.kill(); process.exit(1); }

  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let mid = 0;
  const pending = new Map();
  sock.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params) => new Promise(res => {
    const id = ++mid;
    pending.set(id, res);
    sock.send(JSON.stringify({ id, method, params: params || {} }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const shoot = async (file, w, h, dpr) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: dpr, mobile: dpr < 2
    });
    await sleep(900);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!r.result || !r.result.data) { console.error('截图失败', file, JSON.stringify(r).slice(0, 200)); return false; }
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
    const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
    console.log(`  ✓ ${file}  ${w}x${h}@${dpr}x  ${kb}KB`);
    return true;
  };

  const goTab = async id => {
    await send('Runtime.evaluate', {
      expression: `(function(){try{switchTab('${id}');return 'ok'}catch(e){return 'ERR:'+e.message}})()`,
      returnByValue: true
    });
    await sleep(1100);
  };

  console.log('打开站点…');
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(4500);   // 等首屏渲染 + 新闻抓取

  console.log('开始截图：');
  // 桌面：1440 宽，2x 高清
  await shoot('preview-home.png', 1440, 1180, 2);
  for (const [id, name] of [['news', 'preview-news'], ['books', 'preview-books'], ['fitness', 'preview-fitness']]) {
    await goTab(id);
    await shoot(name + '.png', 1440, 1180, 2);
  }
  // 手机端：展示响应式与全屏番茄钟
  await goTab('home');
  await shoot('preview-mobile.png', 430, 860, 3);

  sock.close();
  child.kill();
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  console.log('完成，输出目录: assets/');
  process.exit(0);
})().catch(e => { console.error('失败:', e && e.message); process.exit(1); });
