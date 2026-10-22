'use client'

import { isShareFresh, pickReceiptFiles, SHARE_DB, SHARE_STORE } from './shareTarget'

/**
 * Holt die per "Teilen" empfangenen Dateien aus IndexedDB ab, die der Service Worker dort abgelegt
 * hat (public/service-worker.js, Format { file, savedAt }). Abholen leert den Speicher immer, auch
 * wenn nichts Brauchbares dabei ist — geteilte Bons sollen nicht auf dem Gerät liegen bleiben.
 */
export function takeSharedFiles(): Promise<File[]> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { resolve([]); return }
        const open = indexedDB.open(SHARE_DB, 1)
        open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE, { autoIncrement: true })
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
            const db = open.result
            const tx = db.transaction(SHARE_STORE, 'readwrite')
            const store = tx.objectStore(SHARE_STORE)
            const all = store.getAll()
            store.clear()
            tx.oncomplete = () => {
                db.close()
                const entries = (all.result ?? []) as { file?: File; savedAt?: number }[]
                const files = entries
                    .filter((e): e is { file: File; savedAt: number } => e.file instanceof Blob && typeof e.savedAt === 'number' && isShareFresh(e.savedAt))
                    .map((e) => e.file)
                resolve(pickReceiptFiles(files))
            }
            tx.onerror = tx.onabort = () => { db.close(); reject(tx.error) }
        }
    })
}
