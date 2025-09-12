const CACHE_NAME = 'S-9993scs';
const urlsToCache = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/css/style2.css',
  '/assets/js/main.js',
  '/manifest.json',
  '/assets/img/icon.png',
];

self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache, adding URLs individually...');
        const cachePromises = urlsToCache.map(url => {
          return cache.add(url).catch(error => {
            console.error(`Failed to cache ${url}:`, error);
          });
        });
        return Promise.all(cachePromises)
          .then(() => {
            console.log('Initial caching process complete.');
            self.skipWaiting();
          });
      })
      .catch(error => {
        console.error('Failed to open cache during install:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('Old caches deleted. Service worker is ready to control clients.');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method === 'POST') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('Serving from cache:', event.request.url);
          return response;
        }
        
        console.log('Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          })
          .catch(error => {
            console.error('Fetch failed for:', event.request.url, error);
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});