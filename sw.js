// © 2026 Артём Иванов. Все права защищены.
// Копирование, изменение и распространение без письменного разрешения автора запрещены (см. LICENSE).
// Офлайн-режим: оболочка из кэша, данные — сначала из сети, без сети — последняя копия.
const CACHE = "tis-rooms-v3-13";
const SHELL = ["./", "index.html", "app.js", "style.css", "manifest.json", "icon-180.png", "icon-512.png"];
// cache: "reload" — мимо HTTP-кэша браузера (GitHub Pages: до 10 мин), иначе в новый кэш ложится старый app.js
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE)
  .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/ics/")) return;
  const isData = /\/(data|changes)\.json$/.test(url.pathname);
  if (isData) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(url.pathname, copy)); return r;
    }).catch(() => caches.match(url.pathname)));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request, { cache: "no-cache" }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
