// 生成带种子数据的预览页并用 Edge headless 截图（用于视觉验证，不影响主文件）
// 用法: node tools/preview-shot.js [模块id=默认mood] [宽] [高]
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..');
const mod = process.argv[2] || 'mood';
const W = process.argv[3] || '1280';
const H = process.argv[4] || '1600';
const src = fs.readFileSync(path.join(root, 'life-workspace.html'), 'utf8');

const seed = `<script>
window.addEventListener('load',function(){setTimeout(function(){
  try{
    var d=new Date();
    function mk(off,emoji,score){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()-off);
      var s=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
      return {id:'seed'+off,date:s,emoji:emoji,score:score,note:'',tags:[]};}
    DATA.moodlog=[mk(0,'\u{1F620}',1),mk(1,'\u{1F642}',4),mk(2,'\u{1F604}',5),mk(3,'\u{1F634}',2),mk(5,'\u{1F525}',5),mk(7,'\u{1F610}',3),mk(9,'\u{1F623}',1)];
    switchTab('${mod}');
    var h=document.querySelector('#moodHeat');
    if(h) h.scrollIntoView({block:'center'});
    document.title='PREVIEW_READY';
  }catch(e){document.title='ERR:'+e.message;}
},400);});
</script>`;
const out = src.replace(/<\/body>/i, seed + '\n</body>');
const tmp = path.join(root, '_preview-' + mod + '.html');
fs.writeFileSync(tmp, out);

const png = path.join(root, '_preview-' + mod + '.png');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-prof-'));
const r = cp.spawnSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--screenshot=' + png, '--window-size=' + W + ',' + H, '--force-device-scale-factor=1',
  '--virtual-time-budget=10000', '--user-data-dir=' + prof,
  'file:///' + tmp.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 120000 });
console.log('edge exit:', r.status);
console.log('png:', fs.existsSync(png) ? fs.statSync(png).size + ' bytes -> ' + png : 'MISSING');
if (r.stderr) console.log('stderr head:', String(r.stderr).split('\n').slice(0, 3).join(' '));
