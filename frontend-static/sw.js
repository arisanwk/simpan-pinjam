// sw.js — Service Worker MINIMAL.
// Satu-satunya tujuan file ini adalah memenuhi syarat "installability" Chrome
// (supaya tombol Install membuat aplikasi berjalan di jendela sendiri tanpa
// address bar -- bukan sekadar shortcut/bookmark biasa). TIDAK melakukan
// caching/offline apapun dengan sengaja -- aplikasi ini adalah sistem
// keuangan yang datanya harus SELALU diambil langsung dari server (Apps
// Script/Google Sheets), jadi "bisa dipakai offline" justru berbahaya
// (bisa menampilkan saldo/kas yang sudah tidak berlaku). Setiap request
// selalu diteruskan ke jaringan apa adanya, tidak pernah disimpan/di-cache.

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
