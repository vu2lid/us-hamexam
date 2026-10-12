"use strict";

// Stage 8A2: the cache-name prefix comes from this edition's own
// namespacePolicy.cachePrefix (scripts/build.js), so one edition's
// activation cleanup below can never delete another edition's caches.
// india-asoc-practice- resolves to "ham-exam-" for the US build, byte-identical
// to the prior hardcoded literal.
const CACHE_PREFIX = "india-asoc-practice-";
const CACHE_NAME = CACHE_PREFIX + "2ebfd74b8c9c";
const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
  "./icons/app-icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => response.ok ? response : Promise.reject(new Error("Navigation failed")))
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
