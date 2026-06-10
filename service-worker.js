const CACHE_NAME = 'wb-indicator-v2';
const STATIC_CACHE = ['/', '/public.html', '/manifest.json'];
// URLs que NUNCA se cachean (datos en tiempo real)
const NO_CACHE_PATTERNS = [
  'datos.json',
  'api/precios',
  'yahoo',
  'finance'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Limpiar caches viejas
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Para datos dinámicos: siempre red, sin cache
  if (NO_CACHE_PATTERNS.some(p => url.includes(p))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para assets estáticos: cache-first
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(fetchResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    })
  );
});
