// ============================
// Service Worker - Offline Support
// ============================
const CACHE_NAME = 'almnhaj-v12';
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

    // Strategy for Firebase Realtime DB (Auth/Dynamic Data) - Network Only/First
    if (url.hostname.includes('firebaseio.com') && !url.pathname.includes('.json')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Strategy: Network falling back to Cache (and cache on success)
    // This is best for external images and assets
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If the response is valid, clone it and save to cache
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // If network fails, try the cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    
                    // Fallback for missing images/content when offline
                    if (event.request.destination === 'image') {
                        // You could return a placeholder image here if desired
                    }
                    return null;
                });
            })
    );
});
