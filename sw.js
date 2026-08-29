const CACHE = 'comparatom-v6';
const ASSETS = ['./index.html', './manifest.json', './icon.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Toujours réseau d'abord pour Firestore / Google APIs
  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('firebase')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
