// 抽取 HTML 中所有 <script> 块做语法校验（等价于逐个 node --check）
// 用法: node tools/check-syntax.js [目标.html]   默认 life-workspace.html
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const target = process.argv[2] || path.join(__dirname, '..', 'life-workspace.html');
const html = fs.readFileSync(target, 'utf8');
const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-chk-'));
let ok = 0;
blocks.forEach((b, i) => {
  const f = path.join(dir, 'b' + i + '.js');
  fs.writeFileSync(f, b[1]);
  const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status === 0) { console.log('  block' + i + ' SYNTAX_OK'); ok++; }
  else { console.log('  block' + i + ' SYNTAX_ERROR:\n' + (r.stderr || '').split('\n').slice(0, 8).join('\n')); }
});
fs.rmSync(dir, { recursive: true, force: true });
console.log('SYNTAX_RESULT: ' + ok + '/' + blocks.length + ' ok  (' + path.basename(target) + ')');
process.exit(ok === blocks.length ? 0 : 1);
