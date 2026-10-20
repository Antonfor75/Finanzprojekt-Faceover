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

// "Teilen" aus anderen Apps (Web Share Target, siehe utils/receiptScan/shareTarget.ts):
// Android schickt die Dateien per POST an SHARE_PATH. Sie gehen hier in IndexedDB und die Seite
// holt sie sich dort ab — so sieht der Server die (oft 3–12 MB großen) Dateien nie.
// Die Namen müssen zu utils/receiptScan/shareTarget.ts passen (shareTarget.test.ts prüft das).
const SHARE_PATH = '/share-receipt'
const SHARE_FIELD = 'files'
const SHARE_DB = 'cashflow-share'
const SHARE_STORE = 'files'

self.addEventListener('fetch', (event) => {
    const request = event.request
    const url = new URL(request.url)
    if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
        event.respondWith(receiveShare(request))
        return
    }
    if (IS_LOCAL) return
    if (request.method !== 'GET') return
    if (url.origin !== self.location.origin) return

    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(cacheFirst(request))
        return
    }
    if (request.mode === 'navigate' && !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/api')) {
        event.respondWith(networkFirst(request))
    }
})

function shareRedirect(status) {
    return Response.redirect(new URL('/?share=' + status, self.location.origin).href, 303)
}

async function receiveShare(request) {
    try {
        const form = await request.formData()
        const files = form.getAll(SHARE_FIELD).filter((f) => typeof f !== 'string')
        if (files.length === 0) return shareRedirect('empty')
        await storeShared(files)
        return shareRedirect('ok')
    } catch {
        return shareRedirect('error')
    }
}

// Ersetzt, was vom letzten Teilen noch liegt; Einträge: { file, savedAt }
function storeShared(files) {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(SHARE_DB, 1)
        open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE, { autoIncrement: true })
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
            const db = open.result
            const tx = db.transaction(SHARE_STORE, 'readwrite')
            const store = tx.objectStore(SHARE_STORE)
            store.clear()
            const savedAt = Date.now()
            for (const file of files) store.add({ file, savedAt })
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = tx.onabort = () => { db.close(); reject(tx.error) }
        }
    })
}

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
