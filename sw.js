// ============================
// Service Worker - Offline Support
// ============================
const CACHE_NAME = 'almnhaj-v14';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/content.js',
    '/manifest.json',
    '/images/icon-192.png',
    '/images/icon-512.png'
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

// Helper: Strip query string from URL for cache matching
function stripQueryString(url) {
    const u = new URL(url);
    u.search = '';
    return u.toString();
}

// Fetch Handler
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and browser extensions
    if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) return;

    // Firebase DB requests - let browser handle naturally (don't intercept)
    // When offline, fetch will fail and auth.js try-catch handles it gracefully
    if (url.hostname.includes('firebaseio.com')) {
        return;
    }

    // Google Fonts - Cache first, then network
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse.ok) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fonts unavailable offline - return empty response to prevent blocking
                    return new Response('', { headers: { 'Content-Type': 'text/css' } });
                });
            })
        );
        return;
    }

    // Strategy: Cache-First for Images
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
                }).catch(() => null);
            })
        );
        return;
    }

    // For app shell files (JS, CSS, HTML) - try cache first (ignoring query strings),
    // then network, with background revalidation
    event.respondWith(
        // First try exact match
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Revalidate in background
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            // No exact match - try matching without query string
            // This handles style.css?v=25 matching cached style.css
            const strippedUrl = stripQueryString(event.request.url);
            return caches.match(strippedUrl).then((strippedResponse) => {
                if (strippedResponse) {
                    return strippedResponse;
                }

                // Nothing in cache - try network
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, cacheCopy);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Completely offline and not cached - return offline fallback for navigation
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html') || caches.match('/');
                    }
                    return new Response('Offline', { status: 503 });
                });
            });
        })
    );
});
