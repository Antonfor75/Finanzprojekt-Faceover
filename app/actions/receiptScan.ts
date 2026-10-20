'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { createProductMatcher } from '@/lib/productMatching'
import { RECEIPT_BUCKET as BUCKET, removeReceiptImages as removeImages } from '@/lib/receiptScanStorage'
import { GeminiError, type GeminiFile } from '@/utils/receiptScan/gemini'
import { analyzeReceipt } from '@/utils/receiptScan/analyze'
import {
    hasReceiptScan, parseAmountInput, RECEIPT_CATEGORIES,
    type Fields, type PendingReceiptRow,
} from '@/utils/receiptScan/fields'

/**
 * Kassenbon-Scan mit Gemini — nur für Konten mit app_metadata.receipt_scan (gesetzt in der
 * Chefansicht). Ein Bon lebt als Zeile in pending_receipts, sein Bild im privaten Bucket
 * "receipt-scans", bis er gespeichert oder verworfen wird; danach sind Zeile UND Bild weg.
 *
 * Anlegen, Auswerten und das Bild laufen über die Service-Role (keine INSERT-Policy, keine
 * Storage-Policies), aber immer erst nach der Prüfung von Login und Merker und immer mit der
 * user_id des Aufrufers im Filter.
 */

const MAX_FILES = 4
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
}
const NOT_ENABLED = 'Der Kassenbon-Scan ist für dein Konto nicht freigeschaltet.'
/** Zeit für Lesen + Selbstkorrektur, mit Luft bis maxDuration = 180 s (app/layout.tsx). */
const ANALYSIS_BUDGET_MS = 165_000

type Result<T> = { ok: true; data: T } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Angemeldeter Nutzer, frisch vom Auth-Server (nicht aus dem Cookie) — so gilt ein neuer Merker sofort. */
async function currentUser(requireScan: boolean) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Nicht angemeldet.' as const }
    if (requireScan && !hasReceiptScan(user)) return { error: NOT_ENABLED }
    return { user, supabase }
}

/**
 * Nur Bilder aus dem eigenen Ordner dieses Bons. image_paths kommt aus der Datenbank — auch wenn
 * der Browser die Spalte nicht ändern darf (Migration 0010), greift die Service-Role nie auf
 * einen Pfad außerhalb von <user_id>/<bon_id>/ zu.
 */
function ownImagePaths(userId: string, row: Pick<PendingReceiptRow, 'id' | 'image_paths'>): string[] {
    const prefix = `${userId}/${row.id}/`
    return (row.image_paths ?? []).filter((p) => typeof p === 'string' && p.startsWith(prefix) && !p.includes('..') && !p.slice(prefix.length).includes('/'))
}

async function loadRow(userId: string, id: string): Promise<PendingReceiptRow | null> {
    const { data } = await supabaseAdmin.from('pending_receipts').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    return (data as PendingReceiptRow | null) ?? null
}

/**
 * Gemini liest den Bon — läuft auf dem Server zu Ende, egal was der Browser macht (Bildschirm aus,
 * Seite zu). Das Ergebnis landet in pending_receipts; der Bon bleibt offen, bis er freigegeben
 * oder verworfen wird. Wurde er in der Zwischenzeit abgebrochen, neu gestartet oder verworfen,
 * verfällt dieses Ergebnis (Abgleich über started_at).
 */
async function runAnalysis(userId: string, id: string, startedAt: string): Promise<void> {
    const deadlineAt = Date.now() + ANALYSIS_BUDGET_MS
    const row = await loadRow(userId, id)
    if (!row) return
    const imagePaths = ownImagePaths(userId, row)

    let patch: Partial<PendingReceiptRow>
    try {
        if (imagePaths.length === 0) throw new GeminiError('Zu diesem Bon gibt es kein Bild mehr.', 'failed')
        const files: GeminiFile[] = []
        for (const path of imagePaths) {
            const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
            if (error || !data) throw new GeminiError('Das Bild des Bons ist nicht mehr da.', 'failed')
            files.push({ mimeType: data.type || 'image/jpeg', base64: Buffer.from(await data.arrayBuffer()).toString('base64') })
        }
        // Bis kurz vor dem Zeitlimit der Funktion (maxDuration in app/layout.tsx) — inkl. Selbstkorrektur.
        const { result, findings, model, usage } = await analyzeReceipt(files, { deadlineAt })
        patch = {
            status: 'ready',
            result: { ...result, model, usage },
            findings,
            message: result.ok ? null : 'Nicht alles erkannt — bitte prüfen und fehlende Angaben selbst eintragen.',
        }
    } catch (err) {
        const message = err instanceof GeminiError ? err.message : 'Die Auswertung ist fehlgeschlagen.'
        if (!(err instanceof GeminiError)) console.error('[receiptScan] Auswertung:', err)
        patch = { status: 'failed', error: message, message }
    }

    await supabaseAdmin.from('pending_receipts')
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('started_at', startedAt)
}

/**
 * Bild(er) hochladen und den Bon als "wird gelesen" anlegen. Die Auswertung startet sofort auf dem
 * Server und läuft nach der Antwort weiter (after) — der Browser fragt nur noch den Stand ab.
 */
export async function createPendingReceipt(formData: FormData): Promise<Result<PendingReceiptRow>> {
    const auth = await currentUser(true)
    if ('error' in auth) return fail(auth.error!)
    const { user } = auth

    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) return fail('Kein Bild ausgewählt.')
    if (files.length > MAX_FILES) return fail(`Höchstens ${MAX_FILES} Bilder pro Bon.`)
    for (const f of files) {
        if (!ALLOWED_TYPES[f.type]) return fail('Nur Fotos (JPG, PNG, WebP) oder PDF.')
        if (f.size > MAX_FILE_BYTES) return fail('Die Datei ist zu groß (höchstens 5 MB).')
    }

    const id = crypto.randomUUID()
    const paths: string[] = []
    for (const [i, f] of files.entries()) {
        const path = `${user.id}/${id}/${i}.${ALLOWED_TYPES[f.type]}`
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false })
        if (error) {
            await removeImages(user.id, paths)
            return fail(`Bild konnte nicht gespeichert werden: ${error.message}`)
        }
        paths.push(path)
    }

    const startedAt = new Date().toISOString()
    const { data, error } = await supabaseAdmin
        .from('pending_receipts')
        .insert({ id, user_id: user.id, status: 'reading', started_at: startedAt, image_paths: paths })
        .select('*')
        .single()
    if (error || !data) {
        await removeImages(user.id, paths)
        return fail(error?.message ?? 'Bon konnte nicht angelegt werden.')
    }
    after(() => runAnalysis(user.id, id, startedAt))
    return { ok: true, data: data as PendingReceiptRow }
}

/**
 * Gemini noch einmal ansetzen (erneut prüfen oder nach einer Unterbrechung). Von Hand geänderte
 * Felder bleiben. Antwortet sofort; die Auswertung läuft auf dem Server weiter.
 */
export async function analyzePendingReceipt(id: string): Promise<Result<PendingReceiptRow>> {
    const auth = await currentUser(true)
    if ('error' in auth) return fail(auth.error!)
    const { user } = auth

    const row = await loadRow(user.id, id)
    if (!row) return fail('Dieser Bon ist nicht mehr offen.')
    if (ownImagePaths(user.id, row).length === 0) return fail('Zu diesem Bon gibt es kein Bild mehr.')

    const startedAt = new Date().toISOString()
    const { data } = await supabaseAdmin.from('pending_receipts')
        .update({ status: 'reading', started_at: startedAt, finished_at: null, error: null, message: null })
        .eq('id', id).eq('user_id', user.id)
        .select('*')
        .maybeSingle()
    if (!data) return fail('Dieser Bon ist nicht mehr offen.')
    after(() => runAnalysis(user.id, id, startedAt))
    return { ok: true, data: data as PendingReceiptRow }
}

/**
 * Ist der Scan für dieses Konto (noch) freigeschaltet? Frisch vom Auth-Server — die Sitzung im
 * Browser kennt eine Abschaltung in der Chefansicht erst nach der nächsten Token-Erneuerung.
 * Wird nur von Konten aufgerufen, deren Sitzung "freigeschaltet" sagt.
 */
export async function getReceiptScanAccess(): Promise<boolean> {
    const auth = await currentUser(true)
    return !('error' in auth)
}

/** Laufende Auswertung abbrechen — der Bon bleibt offen und wird von Hand ausgefüllt. */
export async function cancelPendingReceipt(id: string): Promise<Result<PendingReceiptRow>> {
    const auth = await currentUser(false)
    if ('error' in auth) return fail(auth.error!)
    const { data } = await supabaseAdmin.from('pending_receipts')
        .update({ status: 'ready', started_at: null, finished_at: new Date().toISOString(), message: 'Abgebrochen — bitte selbst eintragen.' })
        .eq('id', id).eq('user_id', auth.user.id).eq('status', 'reading')
        .select('*')
        .maybeSingle()
    const current = (data as PendingReceiptRow | null) ?? await loadRow(auth.user.id, id)
    return current ? { ok: true, data: current } : fail('Dieser Bon ist nicht mehr offen.')
}

/**
 * Bon freigeben: Ausgabe + Artikel speichern, danach Bild und offenen Bon löschen.
 * Gespeichert wird genau, was die Oberfläche zeigt (Fields aus deriveFields).
 */
export async function acceptPendingReceipt(id: string, fields: Pick<Fields, 'store' | 'amount' | 'date' | 'category' | 'items'>): Promise<Result<{ expenseId: number }>> {
    const auth = await currentUser(false)
    if ('error' in auth) return fail(auth.error!)
    const { user, supabase } = auth

    const row = await loadRow(user.id, id)
    if (!row) return fail('Dieser Bon ist nicht mehr offen.')

    const amount = Math.round(parseAmountInput(fields.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) return fail('Bitte einen gültigen Betrag eintragen.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) return fail('Bitte ein gültiges Datum eintragen.')
    const category = RECEIPT_CATEGORIES.includes(fields.category) ? fields.category : 'Sonstiges'

    // 1. Ausgabe (als angemeldeter Nutzer, RLS greift).
    const { data: expense, error: expErr } = await supabase
        .from('expenses')
        .insert({ description: fields.store.trim() || category, amount, expense_date: fields.date, category, user_id: user.id })
        .select('id')
        .single()
    if (expErr || !expense) return fail(expErr?.message || 'Ausgabe konnte nicht gespeichert werden.')

    // 2. Artikel — best-effort, die Ausgabe bleibt in jedem Fall. Produkte zuordnen für die Einkaufs-Analyse.
    const items = (fields.items ?? []).filter((i) => i.nameRaw?.trim() && Number.isFinite(Number(i.totalPrice)))
    if (items.length > 0) {
        const matcher = createProductMatcher(user.id)
        const rows = []
        for (const i of items) {
            rows.push({
                expense_id: expense.id,
                product_id: await matcher.match(i.nameRaw).catch(() => null),
                name_raw: i.nameRaw.trim(),
                quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
                unit: i.unit === 'kg' ? 'kg' : i.unit === 'stk' ? 'stk' : null,
                unit_price: i.unitPrice,
                total_price: Math.round(Number(i.totalPrice) * 100) / 100,
                source: 'manual',
                user_id: user.id,
            })
        }
        const { error } = await supabase.from('receipt_items').insert(rows)
        if (error) console.warn('[receiptScan] Artikel speichern fehlgeschlagen:', error.message)
    }

    // 3. Bild und offenen Bon löschen.
    await removeImages(user.id, ownImagePaths(user.id, row))
    await supabaseAdmin.from('pending_receipts').delete().eq('id', id).eq('user_id', user.id)

    revalidatePath('/')
    return { ok: true, data: { expenseId: expense.id } }
}

/** Bon verwerfen: Bild und offenen Bon löschen, nichts wird gespeichert. */
export async function discardPendingReceipt(id: string): Promise<Result<null>> {
    const auth = await currentUser(false)
    if ('error' in auth) return fail(auth.error!)
    const row = await loadRow(auth.user.id, id)
    if (!row) return { ok: true, data: null }
    await removeImages(auth.user.id, ownImagePaths(auth.user.id, row))
    const { error } = await supabaseAdmin.from('pending_receipts').delete().eq('id', id).eq('user_id', auth.user.id)
    if (error) return fail(error.message)
    return { ok: true, data: null }
}
