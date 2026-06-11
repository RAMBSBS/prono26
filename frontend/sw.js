// frontend/sw.js — cache du shell pour l'installabilité PWA (données toujours réseau)
const CACHE="prono26-v2";
const SHELL=["./","./index.html","./manifest.webmanifest"];
self.addEventListener("install",(e)=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener("activate",(e)=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",(e)=>{
  if(e.request.url.includes("predictions.json"))return; // données : toujours réseau
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
