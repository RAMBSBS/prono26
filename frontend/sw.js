// frontend/sw.js — cache du "shell" pour l'installabilité PWA (données toujours réseau)
const CACHE = "prono26-v1";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest"];

self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes("/api/")) return; // données : toujours réseau, jamais cache
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
