'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/utils/supabase'
import { isDemoMode } from '@/lib/data/mode'
import {
    acceptPendingReceipt, analyzePendingReceipt, cancelPendingReceipt, createPendingReceipt, discardPendingReceipt,
} from '@/app/actions/receiptScan'
import { deriveFields, isActive, isStale, type PendingReceiptRow, type ReceiptEdits } from './fields'
import { prepareReceiptFiles } from './prepareImage'

/**
 * Offene Bons im Browser (Web-Gegenstück zu utils/receiptLlm/pendingReceipts.ts der Handy-App).
 * Die Wahrheit liegt in Supabase (pending_receipts + Bild im Storage); hier ist nur der Spiegel,
 * den Startseiten-Kachel und Scan-Ansicht gemeinsam lesen. Ein Bon bleibt offen, bis er
 * gespeichert oder verworfen wird — auch nach Neuladen der Seite oder auf einem anderen Gerät.
 *
 * Ausgewertet wird auf dem Server (app/actions/receiptScan.ts, after()). Der Browser lädt nur das
 * Foto hoch und fragt danach den Stand ab — Bildschirm aus oder Seite zu stört die Auswertung nicht.
 */

let rows: PendingReceiptRow[] = []
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Von Hand geänderte Felder, die noch nicht in Supabase gesichert sind (id → Timer). */
const editTimers = new Map<string, ReturnType<typeof setTimeout>>()

function setRows(next: PendingReceiptRow[]) {
    rows = next
    emit()
}

function upsert(row: PendingReceiptRow) {
    setRows(rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row])
}

function patch(id: string, changes: Partial<PendingReceiptRow>) {
    if (!rows.some((r) => r.id === id)) return
    setRows(rows.map((r) => (r.id === id ? { ...r, ...changes } : r)))
}

function remove(id: string) {
    setRows(rows.filter((r) => r.id !== id))
}

export const getPendingRows = () => rows

export function usePendingReceipts(): PendingReceiptRow[] {
    return useSyncExternalStore(subscribe, getPendingRows, () => rows)
}

/** Startzeit der laufenden Auswertung laut Datenbank; undefined, wenn nichts läuft. */
export function runningSince(row: PendingReceiptRow | null): number | undefined {
    if (!row || !isActive(row)) return undefined
    return Date.parse(row.started_at ?? row.created_at)
}

let loading: Promise<void> | null = null

/** Offene Bons aus Supabase laden (RLS: nur die eigenen). */
export function loadPending(): Promise<void> {
    if (isDemoMode()) return Promise.resolve()
    loading ??= (async () => {
        const { data, error } = await supabase.from('pending_receipts').select('*').order('created_at')
        if (error) { console.warn('Offene Bons:', error.message); return }
        // Noch nicht gesicherte Handänderungen nicht vom (älteren) Datenbank-Stand überschreiben lassen.
        const fresh = ((data ?? []) as PendingReceiptRow[]).map((r) => {
            const local = editTimers.has(r.id) ? rows.find((x) => x.id === r.id) : undefined
            return local ? { ...r, edits: local.edits } : r
        })
        setRows(fresh)
        resumeInterrupted(fresh)
    })().finally(() => { loading = null })
    return loading
}

/**
 * Hängt eine Auswertung (Server-Funktion abgebrochen, z. B. Zeitlimit), wird sie beim nächsten
 * Laden einmal neu gestartet — wie die Handy-App unterbrochene Bons beim Start neu einreiht.
 */
const resumed = new Set<string>()
function resumeInterrupted(list: PendingReceiptRow[]) {
    for (const r of list) {
        if (r.status === 'reading' && isStale(r) && !r.result && !resumed.has(r.id)) {
            resumed.add(r.id)
            retryPending(r.id)
        }
    }
}

// ---------------------------------------------------------------- Ablauf

/**
 * Bild(er) aufnehmen bzw. wählen → hochladen → offener Bon. Gemini wertet danach auf dem Server
 * aus; das Ergebnis holt usePollWhileReading. onCreated kommt, sobald der Bon angelegt ist.
 */
export async function startScan(files: File[], onCreated?: (id: string) => void): Promise<string> {
    const prepared = await prepareReceiptFiles(files)
    const form = new FormData()
    for (const f of prepared) form.append('files', f)
    const res = await createPendingReceipt(form)
    if (!res.ok) throw new Error(res.error)
    upsert(res.data)
    onCreated?.(res.data.id)
    return res.data.id
}

/** Gemini noch einmal auf den Bon ansetzen. Von Hand geänderte Felder bleiben erhalten. */
export function retryPending(id: string): void {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    patch(id, { status: 'reading', started_at: new Date().toISOString(), error: null, message: null })
    void analyzePendingReceipt(id).then(
        (res) => { if (res.ok) upsert(res.data); else patch(id, { status: 'failed', error: res.error, message: res.error }) },
        () => patch(id, { status: 'failed', error: 'Keine Verbindung — bitte erneut versuchen.', message: 'Keine Verbindung — bitte erneut versuchen.' }),
    )
}

/** Laufende Auswertung abbrechen und selbst eintragen. */
export async function cancelPending(id: string): Promise<void> {
    patch(id, { status: 'ready', message: 'Abgebrochen — bitte selbst eintragen.' })
    const res = await cancelPendingReceipt(id).catch(() => null)
    if (res?.ok) upsert(res.data)
}

// ---------------------------------------------------------------- Bearbeiten, Ignorieren, Freigeben, Verwerfen

async function flushEdits(id: string): Promise<void> {
    const timer = editTimers.get(id)
    if (!timer) return
    clearTimeout(timer)
    editTimers.delete(id)
    const row = rows.find((r) => r.id === id)
    if (row) await supabase.from('pending_receipts').update({ edits: row.edits }).eq('id', id)
}

/** Feld von Hand ändern — sofort sichtbar, kurz darauf in Supabase gesichert (Bon bleibt offen). */
export function editPending(id: string, changes: ReceiptEdits): void {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    patch(id, { edits: { ...row.edits, ...changes } })
    clearTimeout(editTimers.get(id))
    editTimers.set(id, setTimeout(() => { void flushEdits(id) }, 600))
}

/** Auf der Startseite ignorieren: der Bon bleibt offen, ein anderer kommt nach vorn. */
export function skipPending(id: string): void {
    const skipped_at = new Date().toISOString()
    patch(id, { skipped_at })
    void supabase.from('pending_receipts').update({ skipped_at }).eq('id', id)
}

export type AcceptResult = { ok: true; expenseId: number } | { ok: false; error: string }

const accepting = new Set<string>()

/** Bon freigeben: Ausgabe + Artikel speichern; Bild und offener Bon werden danach gelöscht. */
export async function acceptPending(id: string): Promise<AcceptResult> {
    const row = rows.find((r) => r.id === id)
    if (!row) return { ok: false, error: 'Dieser Bon ist nicht mehr offen.' }
    if (isActive(row)) return { ok: false, error: 'Der Bon wird noch ausgewertet.' }
    if (accepting.has(id)) return { ok: false, error: 'Der Bon wird gerade gespeichert.' }
    accepting.add(id)
    try {
        clearTimeout(editTimers.get(id))
        editTimers.delete(id)
        const f = deriveFields(row)
        const res = await acceptPendingReceipt(id, { store: f.store, amount: f.amount, date: f.date, category: f.category, items: f.items })
        if (!res.ok) return res
        remove(id)
        return { ok: true, expenseId: res.data.expenseId }
    } catch {
        return { ok: false, error: 'Speichern fehlgeschlagen — keine Verbindung?' }
    } finally {
        accepting.delete(id)
    }
}

/** Bon verwerfen: Bild und offener Bon werden gelöscht. */
export async function discardPending(id: string): Promise<void> {
    clearTimeout(editTimers.get(id))
    editTimers.delete(id)
    const res = await discardPendingReceipt(id).catch(() => null)
    if (res?.ok) remove(id)
}

/**
 * Solange ein Bon ausgewertet wird, alle paar Sekunden nachsehen. Kommt die Seite wieder in den
 * Vordergrund (Bildschirm an, Tab gewechselt), sofort nachsehen — das Ergebnis ist dann oft schon da.
 */
export function usePollWhileReading(list: PendingReceiptRow[]): void {
    const reading = list.some((r) => isActive(r))
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') void loadPending() }
        document.addEventListener('visibilitychange', onVisible)
        if (!reading) return () => document.removeEventListener('visibilitychange', onVisible)
        const t = setInterval(() => { if (document.visibilityState === 'visible') void loadPending() }, 3000)
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
    }, [reading])
}
