const CACHE_NAME = 'finanzen-app-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // Minimal passthrough
});
