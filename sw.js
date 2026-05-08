// ============================
// Service Worker - Offline Support
// ============================
const CACHE_NAME = 'almnhaj-v13';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/content.js',
    '/js/chatbot.js',
    '/manifest.json'
];

// Install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch Handler
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and browser extensions
    if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) return;

    // Firebase DB requests - Network only
    if (url.hostname.includes('firebaseio.com') && !url.pathname.includes('.json')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Strategy: Cache-First for Images, Stale-While-Revalidate for others
    if (event.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse.ok) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                    }
                    return networkResponse;
                });
            })
        );
    } else {
        // Stale-While-Revalidate for JS, CSS, HTML
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (networkResponse.ok) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                    }
                    return networkResponse;
                }).catch(() => null);

                return cachedResponse || fetchPromise;
            })
        );
    }
});
