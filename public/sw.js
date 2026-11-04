const CACHE_NAME = 'aquaflow-v7';
const NOTIFICATION_ICON = '/university_logo.png';
const NOTIFICATION_BADGE = '/favicon.png';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/university_logo.png',
  '/favicon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.port === '8000' || url.pathname.startsWith('/api')) {
    return;
  }

  if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {});

      return cached || networkFetch;
    })
  );
});

function parsePushPayload(event) {
  const fallback = {
    title: 'AQUA.FLOW',
    body: 'Новое объявление от администрации общежития',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
  };
  if (!event.data) return fallback;

  try {
    return { ...fallback, ...event.data.json() };
  } catch (_) {
    try {
      const text = event.data.text();
      if (text) {
        try {
          return { ...fallback, ...JSON.parse(text) };
        } catch {
          return { ...fallback, body: text };
        }
      }
    } catch (_) {}
  }
  return fallback;
}

self.addEventListener('push', event => {
  const data = parsePushPayload(event);
  const options = {
    body: data.body || fallbackBody(),
    icon: data.icon || NOTIFICATION_ICON,
    badge: data.badge || NOTIFICATION_BADGE,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: `aquaflow-${Date.now()}`,
    data: { url: self.registration.scope },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AQUA.FLOW', options)
      .catch(err => console.error('[SW] showNotification failed:', err))
  );
});

function fallbackBody() {
  return 'Новое объявление от администрации общежития';
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
