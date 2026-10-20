import { describe, it, expect, vi, beforeEach } from 'vitest'

// Nachgebaut: angemeldeter Nutzer (Cookie-Client), Service-Role mit Storage und pending_receipts.
const state = vi.hoisted(() => ({
    user: null as null | { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
    uploads: [] as string[],
    removed: [] as string[],
    rows: [] as Record<string, unknown>[],
    expenses: [] as Record<string, unknown>[],
    afterTasks: [] as (() => unknown)[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
// after(): Arbeit, die nach der Antwort auf dem Server weiterläuft — hier nur einsammeln.
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { state.afterTasks.push(fn) } }))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: state.user } }) },
        from: (table: string) => ({
            insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
                if (table === 'expenses') state.expenses.push(row as Record<string, unknown>)
                return { select: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }), then: (r: (v: unknown) => void) => r({ error: null }) }
            },
        }),
    }),
}))

vi.mock('@/lib/productMatching', () => ({ createProductMatcher: () => ({ match: async () => null }) }))

vi.mock('@/utils/supabase/admin', () => {
    const matches = (row: Record<string, unknown>, filters: [string, unknown][]) => filters.every(([k, v]) => row[k] === v)
    const query = (filters: [string, unknown][] = []) => ({
        eq: (k: string, v: unknown) => query([...filters, [k, v]]),
        maybeSingle: async () => ({ data: state.rows.find((r) => matches(r, filters)) ?? null }),
    })
    const from = () => ({
        select: () => query(),
        insert: (row: Record<string, unknown>) => ({
            select: () => ({ single: async () => { state.rows.push(row); return { data: row, error: null } } }),
        }),
        delete: () => {
            const del = (filters: [string, unknown][]) => ({
                eq: (k: string, v: unknown) => del([...filters, [k, v]]),
                then: (r: (v: unknown) => void) => { state.rows = state.rows.filter((x) => !matches(x, filters)); r({ error: null }) },
            })
            return del([])
        },
    })
    const storage = {
        from: () => ({
            upload: async (path: string) => { state.uploads.push(path); return { error: null } },
            remove: async (paths: string[]) => { state.removed.push(...paths); return { error: null } },
        }),
    }
    return { supabaseAdmin: { from, storage } }
})

import { acceptPendingReceipt, createPendingReceipt, discardPendingReceipt } from '../receiptScan'

const formWith = (...files: File[]) => {
    const f = new FormData()
    for (const file of files) f.append('files', file)
    return f
}
const jpg = () => new File([new Uint8Array([1, 2, 3])], 'bon.jpg', { type: 'image/jpeg' })

beforeEach(() => {
    state.user = null
    state.uploads = []
    state.removed = []
    state.rows = []
    state.expenses = []
    state.afterTasks = []
})

describe('Freischaltung', () => {
    it('ohne Anmeldung kein Scan', async () => {
        const res = await createPendingReceipt(formWith(jpg()))
        expect(res).toEqual({ ok: false, error: 'Nicht angemeldet.' })
        expect(state.uploads).toHaveLength(0)
    })

    it('ohne Merker kein Scan — auch nicht mit Merker in user_metadata', async () => {
        state.user = { id: 'u1', app_metadata: {}, user_metadata: { receipt_scan: true } }
        const res = await createPendingReceipt(formWith(jpg()))
        expect(res.ok).toBe(false)
        expect(state.uploads).toHaveLength(0)
        expect(state.rows).toHaveLength(0)
        expect(state.afterTasks).toHaveLength(0)
    })

    it('mit Merker: Bild landet im eigenen Ordner, Bon ist offen', async () => {
        state.user = { id: 'u1', app_metadata: { receipt_scan: true } }
        const res = await createPendingReceipt(formWith(jpg()))
        expect(res.ok).toBe(true)
        expect(state.uploads).toHaveLength(1)
        expect(state.uploads[0]).toMatch(/^u1\/[0-9a-f-]{36}\/0\.jpg$/)
        expect(state.rows[0]).toMatchObject({ user_id: 'u1', status: 'reading' })
        // Die Auswertung läuft auf dem Server weiter, unabhängig vom Browser.
        expect(state.afterTasks).toHaveLength(1)
    })

    it('lehnt andere Dateitypen ab', async () => {
        state.user = { id: 'u1', app_metadata: { receipt_scan: true } }
        const res = await createPendingReceipt(formWith(new File(['x'], 'a.txt', { type: 'text/plain' })))
        expect(res.ok).toBe(false)
        expect(state.uploads).toHaveLength(0)
    })
})

describe('Bild nur solange der Bon offen ist', () => {
    beforeEach(() => {
        state.user = { id: 'u1', app_metadata: { receipt_scan: true } }
        state.rows = [{ id: 'b1', user_id: 'u1', status: 'ready', image_paths: ['u1/b1/0.jpg'] }]
    })

    it('Speichern legt die Ausgabe an und löscht Bild + offenen Bon', async () => {
        const res = await acceptPendingReceipt('b1', { store: 'REWE', amount: '12,34', date: '2026-10-18', category: 'Essen', items: [] })
        expect(res).toEqual({ ok: true, data: { expenseId: 7 } })
        expect(state.expenses[0]).toMatchObject({ amount: 12.34, description: 'REWE', expense_date: '2026-10-18', category: 'Essen' })
        expect(state.removed).toEqual(['u1/b1/0.jpg'])
        expect(state.rows).toHaveLength(0)
    })

    it('ungültiger Betrag: nichts wird gespeichert oder gelöscht', async () => {
        const res = await acceptPendingReceipt('b1', { store: 'REWE', amount: '', date: '2026-10-18', category: 'Essen', items: [] })
        expect(res.ok).toBe(false)
        expect(state.expenses).toHaveLength(0)
        expect(state.removed).toHaveLength(0)
        expect(state.rows).toHaveLength(1)
    })

    it('Verwerfen löscht Bild + offenen Bon', async () => {
        const res = await discardPendingReceipt('b1')
        expect(res.ok).toBe(true)
        expect(state.removed).toEqual(['u1/b1/0.jpg'])
        expect(state.rows).toHaveLength(0)
    })

    it('fremde Bons bleiben unangetastet', async () => {
        state.user = { id: 'u2', app_metadata: { receipt_scan: true } }
        await discardPendingReceipt('b1')
        expect(state.removed).toHaveLength(0)
        expect(state.rows).toHaveLength(1)
    })
})

describe('Bildpfade aus der Datenbank', () => {
    it('fremde oder umgebogene Pfade werden nie angefasst', async () => {
        state.user = { id: 'u1', app_metadata: { receipt_scan: true } }
        state.rows = [{ id: 'b1', user_id: 'u1', status: 'ready', image_paths: ['u2/b9/0.jpg', 'u1/b2/0.jpg', 'u1/b1/../../u2/b9/0.jpg', 'u1/b1/0.jpg'] }]
        await discardPendingReceipt('b1')
        expect(state.removed).toEqual(['u1/b1/0.jpg'])
    })
})
