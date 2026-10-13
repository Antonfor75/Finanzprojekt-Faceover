// Offline-fähige App-Hülle. Es werden NUR eigene, statische Dateien zwischengespeichert –
// keine Finanzdaten (die laufen direkt zu Supabase und werden nie hier abgelegt).
//  - /_next/static/*  : Dateinamen enthalten einen Hash → einmal laden, danach aus dem Cache
//  - Seitenaufrufe    : immer aus dem Netz (neueste Version); nur offline die zuletzt
//                       geladene Seite, damit die App auch im Funkloch startet
// Alles andere (Supabase, Server Actions, POST, fremde Hosts) geht unverändert ins Netz.
const STATIC_CACHE = 'cashflow-static-v1'
const PAGE_CACHE = 'cashflow-pages-v1'
const KEEP = [STATIC_CACHE, PAGE_CACHE]
const MAX_STATIC_ENTRIES = 300

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys()
        await Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)))
        await self.clients.claim()
    })())
})

// Lokal (npm run dev) haben die Dateien unter /_next/static keine Inhalts-Hashes –
// dort würde der Cache alten Code ausliefern. Also nur auf der echten Domain cachen.
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname)

self.addEventListener('fetch', (event) => {
    if (IS_LOCAL) return
    const request = event.request
    if (request.method !== 'GET') return
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return

    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(cacheFirst(request))
        return
    }
    if (request.mode === 'navigate' && !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/api')) {
        event.respondWith(networkFirst(request))
    }
})

async function cacheFirst(request) {
    const cache = await caches.open(STATIC_CACHE)
    const hit = await cache.match(request)
    if (hit) return hit
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).then(() => trim(cache)).catch(() => {})
    }
    return response
}

async function networkFirst(request) {
    const cache = await caches.open(PAGE_CACHE)
    try {
        const response = await fetch(request)
        if (response.ok && response.type === 'basic' && !response.redirected) {
            cache.put(request, response.clone()).catch(() => {})
        }
        return response
    } catch (error) {
        // Offline: zuletzt geladene Fassung dieser Seite
        const cached = await cache.match(request, { ignoreSearch: true })
        if (cached) return cached
        throw error
    }
}

// Älteste Einträge entfernen, damit sich alte Versionen nicht ewig ansammeln
async function trim(cache) {
    const keys = await cache.keys()
    for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i++) await cache.delete(keys[i])
}
