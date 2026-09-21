self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL('./?messages=1', self.registration.scope).href;
  event.waitUntil((async () => {
    const open = await clients.matchAll({type:'window',includeUncontrolled:true});
    const app = open.find(client => client.url.startsWith(self.registration.scope) && !client.url.includes('/admin.html'));
    if(app) { await app.navigate(url); return app.focus(); }
    return clients.openWindow(url);
  })());
});
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
let notificationQueue = Promise.resolve();
const PUSH_STATE_CACHE = 'vip-push-state';
const pushStateKey = new URL('./__push_badge_state', self.registration.scope).href;
async function updatePushState(payload, count) {
  const cache = await caches.open(PUSH_STATE_CACHE);
  const saved = await cache.match(pushStateKey);
  const state = saved ? await saved.json() : {count:0,events:[]};
  if (payload) {
    const eventId = payload.eventId;
    if (!eventId || state.events.includes(eventId)) return;
    const url = new URL('./?messages=1', self.registration.scope).href;
    await self.registration.showNotification('V.I.P. Card', {
      body: 'Hai un nuovo messaggio da V.I.P. Apri l’app per leggerlo.',
      icon: new URL('./assets/icon-192.png', self.registration.scope).href,
      badge: new URL('./assets/notification-badge-large.png', self.registration.scope).href,
      tag: 'vip-' + eventId, renotify: false, silent: false,
      data: {url}
    });
    state.events = [...state.events, eventId].slice(-100);
    state.count = Math.min(999, (Number(state.count)||0)+1);
  } else { state.count = Math.max(0,Math.min(999,Number(count)||0)); }
  await cache.put(pushStateKey, new Response(JSON.stringify(state)));
  try {
    if(state.count) await self.navigator.setAppBadge?.(state.count);
    else await self.navigator.clearAppBadge?.();
  } catch {}
}
function queuePushWork(payload, count) {
  notificationQueue = notificationQueue.catch(()=>{}).then(()=>updatePushState(payload,count));
  return notificationQueue;
}
messaging.onBackgroundMessage(payload => {
  // Firebase displays notification payloads itself. Our sender uses data-only payloads.
  if(payload.notification) return;
  return queuePushWork(payload.data);
});
self.addEventListener('message', event => {
  if(event.data?.type === 'VIP_BADGE') event.waitUntil(queuePushWork(null,event.data.count));
  if(event.data?.type === 'VIP_FOREGROUND_PUSH') event.waitUntil(queuePushWork(event.data.payload));
});
const CACHE = 'vip-card-v6-5-1-registration-gender';
const ASSETS = [
  './', './index.html', './styles.css?v=6.4.0', './app.js?v=6.5.1', './manifest.webmanifest', './privacy.html',
  './assets/notification-badge-large.png', './assets/logo-vip.png', './assets/icon-192.png', './assets/icon-512.png', './assets/federica-avatar.webp?v=3',
  './customer-groups.js?v=6.5.0', './styles.css?v=6.5.0', './admin.html', './admin.js?v=6.5.0', './push-client.js?v=6.4.0', './push-config.js?v=6.4.0'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PUSH_STATE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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

