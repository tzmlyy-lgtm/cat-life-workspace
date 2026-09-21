/* 喵星驻地球办事处 · Service Worker
   策略：页面走「网络优先 + 离线回退缓存」保证每次部署都能拿到最新版本；
        图标等静态资源走「缓存优先」保证离线可用。
   跨域请求（新闻接口）不拦截，交给浏览器按正常流程处理。 */

const VERSION = 'v3';
const SHELL = 'cat-shell-' + VERSION;   /* 页面外壳 */
const ASSETS = 'cat-assets-' + VERSION; /* 图标等静态资源 */

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png',
  './icon-192.png',
  './icon-180.png',
  './favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => (k.indexOf('cat-') === 0 && k !== SHELL && k !== ASSETS) ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   /* 跨域：不缓存、不拦截 */

  /* 页面导航：网络优先，失败回退缓存（离线仍可打开） */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const cp = res.clone();
          caches.open(SHELL).then(c => c.put('./index.html', cp)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* 静态资源：缓存优先，命中即返回，否则取网络并回填 */
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
          const cp = res.clone();
          caches.open(ASSETS).then(c => c.put(req, cp)).catch(() => {});
        }
        return res;
      });
    })
  );
});
