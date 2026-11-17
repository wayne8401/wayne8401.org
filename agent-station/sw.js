const CACHE = 'agent-station-v1';
const ASSETS = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never cache live agent API data
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
