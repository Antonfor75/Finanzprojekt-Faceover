import { supabaseAdmin } from '@/utils/supabase/admin'

/**
 * Bonbilder des Kassenbon-Scans im privaten Bucket "receipt-scans" (<user_id>/<bon_id>/<n>.<ext>).
 * Nur serverseitig (Service-Role). Bewusst KEINE Server Action: sonst könnte der Browser
 * fremde user_ids übergeben.
 */

export const RECEIPT_BUCKET = 'receipt-scans'

/** Bilder löschen. Pfade außerhalb des Ordners des Nutzers werden nie angefasst. */
export async function removeReceiptImages(userId: string, paths: string[]): Promise<void> {
    const own = paths.filter((p) => p.startsWith(`${userId}/`))
    if (own.length === 0) return
    const { error } = await supabaseAdmin.storage.from(RECEIPT_BUCKET).remove(own)
    if (error) console.warn('[receiptScan] Bilder löschen fehlgeschlagen:', error.message)
}

/** Alle Bonbilder eines Nutzers löschen (Konto zurücksetzen/löschen). Fehlt der Bucket, passiert nichts. */
export async function removeAllReceiptImages(userId: string): Promise<void> {
    if (!userId) return
    const { data: dirs } = await supabaseAdmin.storage.from(RECEIPT_BUCKET).list(userId, { limit: 1000 })
    for (const dir of dirs ?? []) {
        const { data: files } = await supabaseAdmin.storage.from(RECEIPT_BUCKET).list(`${userId}/${dir.name}`, { limit: 100 })
        await removeReceiptImages(userId, (files ?? []).map((f) => `${userId}/${dir.name}/${f.name}`))
    }
}
