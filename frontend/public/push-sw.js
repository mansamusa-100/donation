/* global self, clients */
/**
 * Extra service worker handlers for Web Push (imported by Workbox via VitePWA).
 * Payload shape from the API: { title, body, url }
 */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Barakah Fund',
    body: 'You received a new donation.',
    url: '/dashboard'
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = { ...data, ...parsed };
      }
    }
  } catch {
    try {
      const text = event.data?.text?.();
      if (text) {
        data.body = text;
      }
    } catch {
      // keep defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(String(data.title || 'Barakah Fund'), {
      body: String(data.body || 'You received a new donation.'),
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: String(data.url || '/dashboard') }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(targetUrl).then((c) => (c && 'focus' in c ? c.focus() : client.focus()));
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
