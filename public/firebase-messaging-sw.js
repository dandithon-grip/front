/* Firebase public web config only. No session token or server credential is sent to this worker. */
'use strict';

const safeLink = (value) => {
  try {
    const url = new URL(typeof value === 'string' ? value : '/home', self.location.origin);
    return url.origin === self.location.origin && ['/home', '/route', '/routes', '/record', '/my'].includes(url.pathname)
      ? url.pathname : '/home';
  } catch { return '/home'; }
};

// Register before Firebase, whose default handler would otherwise open an unchecked payload URL.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const data = event.notification.data || {};
  const payload = data.FCM_MSG || {};
  const href = safeLink(data.link || payload.fcmOptions?.link || payload.data?.link);
  const destination = new URL(href, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
    });
    if (existing) {
      await existing.navigate(destination);
      await existing.focus();
    } else await self.clients.openWindow(destination);
  })());
});

const input = new URL(self.location.href).searchParams;
const firebaseConfig = {};
for (const key of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
  if (input.get(key)) firebaseConfig[key] = input.get(key);
}
if (!['apiKey', 'projectId', 'messagingSenderId', 'appId'].every((key) => firebaseConfig[key])) {
  throw new Error('Firebase public web configuration is incomplete');
}
importScripts('https://www.gstatic.com/firebasejs/13.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging-compat.js');
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  // Backend webpush.notification messages are already displayed by FCM; do not display them twice.
  if (payload.notification) return;
  const data = payload.data || {};
  if (!data.title && !data.body) return;
  return self.registration.showNotification(String(data.title || '오늘의 샛길').slice(0, 80), {
    body: String(data.body || '').slice(0, 300),
    tag: payload.messageId || 'saetgil-card',
    data: { link: safeLink(data.link) },
  });
});
