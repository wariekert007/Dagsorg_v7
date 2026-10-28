/* Offline cache for Dagsorg. Bump VERSION when you change any app file. */
var VERSION = 'dagsorg-v8';
var SHELL = ['./', 'index.html', 'app.js', 'i18n.js', 'export.js', 'manifest.webmanifest',
             'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
             'forms/Inskrywingsvorm.pdf', 'forms/Kontrak.pdf', 'forms/Vrywaringsvorm.pdf'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // App files: serve from cache instantly, refresh the cache in the background.
  e.respondWith(caches.open(VERSION).then(function (c) {
    var key = req.mode === 'navigate' ? 'index.html' : req;
    return c.match(key, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok) c.put(key, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

// Tapping the diary reminder opens the app
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    if (self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
