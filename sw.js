/* HABIT OS service worker — offline runtime cache (no build plugin needed).
   Strategy: navigation = network-first with cache fallback; static assets = cache-first. */
const CACHE = 'habit-os-v3'  // bump = जुनी cache आपोआप काढली जाते
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((ch) => ch.put('./index.html', c)); return r }).catch(() => caches.match('./index.html')))
    return
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((ch) => ch.put(e.request, c)) } return r })))
})
