importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD-q497X-cHUezvOBL_TKc3L8sHmNQOLDs',
  authDomain: 'vip-card-22fbe.firebaseapp.com',
  projectId: 'vip-card-22fbe',
  storageBucket: 'vip-card-22fbe.firebasestorage.app',
  messagingSenderId: '654929991228',
  appId: '1:654929991228:web:f7b91cc0f57c34342e5539'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'V.I.P. Sigarette Elettroniche';
  const options = {
    body: payload.notification?.body || 'Hai un nuovo avviso V.I.P.',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    data: {
      url: payload.data?.url || './'
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification.data?.url || './';

  event.waitUntil(
    clients.openWindow(url)
  );
});
const CACHE = 'vip-card-v5-7-push';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest', './privacy.html',
  './assets/logo-vip.png', './assets/icon-192.png', './assets/icon-512.png',
  './admin.html', './admin.js'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    throw new Error('Offline');
  }));
});
