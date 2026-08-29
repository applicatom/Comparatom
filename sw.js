const CACHE = 'comparatom-v7';
const ASSETS = ['./index.html', './manifest.json', './icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Réseau uniquement pour Firestore / Google APIs
  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('firebase')) return;

  const isShell = e.request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/Comparatom/')
    || url.pathname.endsWith('/sw.js');

  if (isShell) {
    // network-first : on prend toujours la dernière version en ligne, cache = secours hors-ligne
    e.respondWith((async () => {
      try {
        const resp = await fetch(e.request, { cache: 'no-store' });
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        }
        return resp;
      } catch (err) {
        return (await caches.match(e.request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // cache-first pour le reste (icônes, manifest…)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
