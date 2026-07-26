const CACHE_NAME = 'tatai-tracker-v2';
const VAPID_PUBLIC_KEY = 'BK3xvCCzNJbkYNDvMkRVF9z5N2rK9vr31tJkGmzSwXJ9zpzs4Q1K_0WBYCp5qDqfsVHvk0Xy0U5xVacWlwQxePx_PLy6R_FSWVix7Vjwl-A';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tatai Tracker', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-32.png',
      vibrate: [200, 100, 200],
      data: data
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
