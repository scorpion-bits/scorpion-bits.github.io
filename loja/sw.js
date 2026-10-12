// Gerado por scripts/pwa-plugin.mjs — não edite. Versão ec6b7c46ce.
const CACHE = 'loja-ec6b7c46ce';
const ARQUIVOS = ["./","./assets/icones-32-CVIZnIZZ.png","./assets/icones-64-DqgNsHgp.png","./assets/index-Cea6-wC4.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./index.html","./manifest.webmanifest","../assets/vendor/pixi.min.js?v=8.22.0","../assets/fonts/grotesk-latin.woff2","../assets/fonts/inter-latin.woff2","../assets/logo-glyph.png","../assets/favicon.png"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('loja-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// cache primeiro (os arquivos do build têm hash no nome); o que não estiver lá vai à rede e fica guardado
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit
      || fetch(req).then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
