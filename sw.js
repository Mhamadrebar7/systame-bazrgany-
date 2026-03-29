const CACHE_NAME = 'pm-app-cache-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './utils.js',
  './customer.html',
  './codex_patch.js',
  './customer_patch.js',
];

function isCacheableProtocol(request) {
  try {
    const url = new URL(request.url);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function safeCachePut(cache, request, response) {
  try {
    await cache.put(request, response.clone());
  } catch (err) {
    console.warn('[sw] cache put skipped:', err);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of STATIC_ASSETS) {
      try {
        const request = new Request(asset, { cache: 'no-cache' });
        if (!isCacheableProtocol(request)) continue;
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          await safeCachePut(cache, request, response);
        }
      } catch (err) {
        console.warn('[sw] precache skipped:', asset, err);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  if (!isCacheableProtocol(request)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        await safeCachePut(cache, request, response);
      }
      return response;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
