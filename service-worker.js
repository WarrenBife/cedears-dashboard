const CACHE_NAME = 'wb-indicator-v3';
const STATIC_CACHE = ['/manifest.json'];

// Siempre ir a la red (nunca cache) para estas URLs
const BYPASS_PATTERNS = [
  'datos.json', 'regimen.json',
  '/api/', 'yahoo', 'finance',
  'googleapis', 'gstatic'
];
// El HTML principal siempre desde la red para que los clientes reciban updates
const BYPASS_PATHS = ['/', '/index.html', '/public.html', '/guia.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  let pathname = '/';
  try { pathname = new URL(url).pathname; } catch(e) {}

  // Bypass total: siempre red
  if (
    BYPASS_PATTERNS.some(p => url.includes(p)) ||
    BYPASS_PATHS.some(p => pathname === p || pathname.endsWith('/index.html'))
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first para assets estáticos (manifest, íconos, etc.)
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
