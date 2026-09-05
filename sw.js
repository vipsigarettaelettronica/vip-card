const CACHE = 'vip-card-v1';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/logo-vip.png','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
