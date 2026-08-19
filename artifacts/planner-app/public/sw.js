// Kivora Service Worker
// Handles: push notifications + app-shell caching for PWA install/offline

// ── Cache config ──────────────────────────────────────────────────────────────
const SHELL_CACHE = 'kivora-shell-v1';

// Assets to pre-cache on install (relative to SW scope).
// NOTE: './app' is intentionally excluded — it's an auth-gated route that
// client-side redirects when unauthenticated, which would poison the cache.
const SHELL_ASSETS = [
  './',
  './manifest.json',
  './favicon.ico',
  './favicon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

// ── Install: pre-cache app shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => { /* non-fatal — push still works without cache */ })
      .finally(() => self.skipWaiting()),
  );
});

// ── Activate: clean up old caches & take control immediately ──────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => clients.claim()),
  );
});

// ── Fetch: network-first for everything; fall back to cache for navigations ───
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET same-origin requests
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // Skip Firebase / external API calls — always network
  const url = new URL(request.url);
  if (
    url.hostname.includes('firestore') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic')
  ) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful opaque or 2xx responses for static assets
        if (response && (response.ok || response.type === 'opaque')) {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        // Network failed — serve from cache (offline support)
        caches.match(request).then(
          (cached) =>
            cached ||
            // For navigate requests, serve the app shell
            (request.mode === 'navigate'
              ? caches.match('./')
              : Response.error()),
        ),
      ),
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Kivora', body: event.data.text() };
  }

  const base = self.registration.scope.replace(/\/$/, '');
  const title = data.title || 'Kivora';
  const options = {
    body: data.body || '',
    icon: data.icon || `${base}/icon-192.png`,
    badge: data.badge || `${base}/favicon.ico`,
    data: { url: data.url || `${self.location.origin}${base}/app/notifications` },
    tag: data.tag || 'kivora',
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url =
    event.notification.data?.url ||
    `${self.location.origin}${self.registration.scope}`;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (
            client.url.startsWith(self.location.origin) &&
            'focus' in client
          ) {
            return client
              .navigate(url)
              .then(() => client.focus())
              .catch(() => {
                if (clients.openWindow) return clients.openWindow(url);
              });
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
