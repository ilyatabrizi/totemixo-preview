/* TOTEM IXO preview — offline shell */
const C = 'totemixo-0c6f0eeb9a';
const CORE = ['./','./index.html','./app.css?v=0c6f0eeb9a','./app.js?v=0c6f0eeb9a','./data.js?v=0c6f0eeb9a','./manifest.webmanifest'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE).catch(()=>{})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k !== C).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => {
      const copy = res.clone();
      caches.open(C).then(c => c.put(r, copy));
      return res;
    }).catch(() => caches.match(r).then(h => h || caches.match('./index.html'))));
    return;
  }
  e.respondWith(
    caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(C).then(c => c.put(r, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
