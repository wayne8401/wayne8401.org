const CACHE = 'agent-station-v31';
const ASSETS = ['./', './index.html', './app.js', './station-view.js', './figures.js', './city-view.js', './city3d.js', './space-agency.html', './space-agency/', './space-agency/manifest.webmanifest', './space-agency-icon.svg', './commander.js', './characters.js', './engine.js', './vendor/anthropic-sdk.mjs', './styles.css', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return; // never cache live agent data
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
