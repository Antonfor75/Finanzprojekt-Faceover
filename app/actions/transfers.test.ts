import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Prüft die Server-Actions für Umbuchungen gegen eine kleine In-Memory-"Datenbank":
 * immer derselbe Betrag auf beiden Seiten, Gegenbuchung beim Ändern/Löschen und
 * saubere Rücknahme, wenn ein Schritt mittendrin scheitert.
 */

type Row = Record<string, unknown>
type Db = Record<string, Row[]> & { __fail?: (table: string, op: string) => string | null }

let db: Db
let nextId = 1

class Query {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private payload: unknown
    private filters: [string, unknown][] = []
    private returning = false
    private mode: 'many' | 'one' | 'maybe' = 'many'
    constructor(private table: string) {}

    select() { if (this.op !== 'select') this.returning = true; return this }
    insert(p: Row | Row[]) { this.op = 'insert'; this.payload = p; return this }
    update(p: Row) { this.op = 'update'; this.payload = p; return this }
    delete() { this.op = 'delete'; return this }
    eq(col: string, val: unknown) { this.filters.push([col, val]); return this }
    maybeSingle() { this.mode = 'maybe'; return this }
    single() { this.mode = 'one'; return this }

    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(this.exec()).then(resolve, reject)
    }

    private exec() {
        const rows = (db[this.table] ??= [])
        const failure = db.__fail?.(this.table, this.op)
        if (failure) return { data: null, error: { message: failure } }

        const matches = () => rows.filter(r => this.filters.every(([c, v]) => String(r[c]) === String(v)))
        const shape = (data: Row[]) => {
            if (this.mode === 'many') return { data, error: null }
            return { data: data[0] ?? null, error: this.mode === 'one' && !data[0] ? { message: 'no rows' } : null }
        }

        if (this.op === 'insert') {
            const list = (Array.isArray(this.payload) ? this.payload : [this.payload as Row]).map((p: Row) => ({ id: nextId++, ...p }))
            rows.push(...list)
            return shape(this.returning ? list : [])
        }
        if (this.op === 'update') {
            const hit = matches()
            hit.forEach(r => Object.assign(r, this.payload as Row))
            return shape(this.returning ? hit : [])
        }
        if (this.op === 'delete') {
            const hit = matches()
            db[this.table] = rows.filter(r => !hit.includes(r))
            return shape([])
        }
        return shape(matches())
    }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
        from: (table: string) => new Query(table),
    }),
}))

import { createTransfer, updateTransfer, deleteTransfer } from './transfers'

const base = { reason: 'Kino', date: '2026-10-08' }
const V2 = { kind: 'v2' as const, accountId: 1 }
const LEGACY = { kind: 'legacy' as const, accountId: 5 }

beforeEach(() => {
    nextId = 1
    db = {
        expenses: [],
        fun_accounts_v2: [{ id: 1, name: 'Spaßkonto' }],
        fun_income_entries: [],
        fun_group_expenses: [],
        accounts: [{ id: 5, name: 'Urlaub', type: 'fun', amount: 100 }],
        account_transactions: [],
    }
})

describe('createTransfer', () => {
    it('Abbuchen aufs neue Spaßkonto: Ausgabe + Einnahme mit demselben Betrag und derselben transfer_id', async () => {
        const r = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: V2 })
        expect(r.success).toBe(true)
        expect(db.expenses).toHaveLength(1)
        expect(db.fun_income_entries).toHaveLength(1)
        expect(db.expenses[0]).toMatchObject({ amount: 20, description: 'Kino', category: 'Umbuchung', user_id: 'user-1' })
        expect(db.fun_income_entries[0]).toMatchObject({ amount: 20, description: 'Kino', income_date: '2026-10-08' })
        expect(db.expenses[0].transfer_id).toBeTruthy()
        expect(db.fun_income_entries[0].transfer_id).toBe(db.expenses[0].transfer_id)
        expect(db.expenses[0].account_id).toBeUndefined() // sonst budget-neutral
    })

    it('Hinzufügen zum Girokonto vom neuen Spaßkonto: negative Ausgabe + Spaßkonto-Ausgabe', async () => {
        await createTransfer({ direction: 'to_giro', amount: 12.5, ...base, target: V2 })
        expect(db.expenses[0].amount).toBe(-12.5)
        expect(db.fun_group_expenses[0]).toMatchObject({ amount: 12.5 })
        expect(db.fun_group_expenses[0].transfer_id).toBe(db.expenses[0].transfer_id)
    })

    it('altes Spaßkonto: Saldo und Historie verändern sich um genau denselben Betrag', async () => {
        await createTransfer({ direction: 'from_giro', amount: 30, ...base, target: LEGACY })
        expect(db.accounts[0].amount).toBe(130)
        expect(db.account_transactions[0]).toMatchObject({ account_id: 5, amount: 30, type: 'transfer_in', note: 'Kino' })
        expect(db.expenses[0].amount).toBe(30)

        await createTransfer({ direction: 'to_giro', amount: 50, reason: 'Rückholen', date: base.date, target: LEGACY })
        expect(db.accounts[0].amount).toBe(80)
        expect(db.account_transactions[1]).toMatchObject({ amount: -50, type: 'transfer_out' })
        expect(db.expenses[1].amount).toBe(-50)
    })

    it('altes Spaßkonto ohne genug Guthaben: Fehler, nichts wird gebucht', async () => {
        const r = await createTransfer({ direction: 'to_giro', amount: 500, ...base, target: LEGACY })
        expect(r.success).toBe(false)
        expect(db.accounts[0].amount).toBe(100)
        expect(db.expenses).toHaveLength(0)
        expect(db.account_transactions).toHaveLength(0)
    })

    it('ohne Spaßkonto: nur Girokonto, keine transfer_id', async () => {
        const r = await createTransfer({ direction: 'to_giro', amount: 9, ...base, target: null })
        expect(r.success).toBe(true)
        expect(db.expenses).toHaveLength(1)
        expect(db.expenses[0]).toMatchObject({ amount: -9, transfer_id: null, category: 'Manuelle Buchung' })
    })

    it('verlangt Begründung und positiven Betrag', async () => {
        expect((await createTransfer({ direction: 'from_giro', amount: 5, reason: ' ', date: base.date, target: V2 })).success).toBe(false)
        expect((await createTransfer({ direction: 'from_giro', amount: 0, ...base, target: V2 })).success).toBe(false)
        expect(db.expenses).toHaveLength(0)
    })

    it('Fehler auf der Spaßkonto-Seite nimmt die Girokonto-Buchung zurück', async () => {
        db.__fail = (table, op) => (table === 'fun_income_entries' && op === 'insert' ? 'boom' : null)
        const r = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: V2 })
        expect(r.success).toBe(false)
        expect(db.expenses).toHaveLength(0)
    })

    it('Fehler beim Protokollieren (altes Konto) stellt Saldo und Girokonto wieder her', async () => {
        db.__fail = (table, op) => (table === 'account_transactions' && op === 'insert' ? 'boom' : null)
        const r = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: LEGACY })
        expect(r.success).toBe(false)
        expect(db.accounts[0].amount).toBe(100)
        expect(db.expenses).toHaveLength(0)
    })

    it('unbekanntes neues Spaßkonto wird abgelehnt', async () => {
        const r = await createTransfer({ direction: 'from_giro', amount: 5, ...base, target: { kind: 'v2', accountId: 99 } })
        expect(r.success).toBe(false)
        expect(db.expenses).toHaveLength(0)
    })
})

describe('updateTransfer / deleteTransfer – beide Seiten bleiben gleich', () => {
    it('Betrag ändern trifft beide Seiten (neues Spaßkonto)', async () => {
        const r = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: V2 })
        if (!r.success) throw new Error('setup')
        const u = await updateTransfer(r.transferId, { amount: 35, reason: 'Konzert', date: '2026-10-09' })
        expect(u.success).toBe(true)
        expect(db.expenses[0]).toMatchObject({ amount: 35, description: 'Konzert', expense_date: '2026-10-09' })
        expect(db.fun_income_entries[0]).toMatchObject({ amount: 35, description: 'Konzert', income_date: '2026-10-09' })
    })

    it('Betrag ändern behält die Richtung bei (Hinzufügen bleibt negativ)', async () => {
        const r = await createTransfer({ direction: 'to_giro', amount: 10, ...base, target: V2 })
        if (!r.success) throw new Error('setup')
        await updateTransfer(r.transferId, { amount: 25, reason: 'Kino', date: base.date })
        expect(db.expenses[0].amount).toBe(-25)
        expect(db.fun_group_expenses[0].amount).toBe(25)
    })

    it('Betrag ändern korrigiert den Saldo des alten Spaßkontos um die Differenz', async () => {
        const r = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: LEGACY })
        if (!r.success) throw new Error('setup')
        expect(db.accounts[0].amount).toBe(120)
        await updateTransfer(r.transferId, { amount: 35, reason: 'Kino', date: base.date })
        expect(db.accounts[0].amount).toBe(135)
        expect(db.account_transactions[0].amount).toBe(35)
        expect(db.expenses[0].amount).toBe(35)
    })

    it('Ändern scheitert sauber, wenn das alte Spaßkonto sonst ins Minus ginge', async () => {
        const r = await createTransfer({ direction: 'to_giro', amount: 60, ...base, target: LEGACY })
        if (!r.success) throw new Error('setup')
        expect(db.accounts[0].amount).toBe(40)
        const u = await updateTransfer(r.transferId, { amount: 150, reason: 'x', date: base.date })
        expect(u.success).toBe(false)
        expect(db.accounts[0].amount).toBe(40)
        expect(db.expenses[0].amount).toBe(-60)
    })

    it('Löschen entfernt beide Seiten (neues Spaßkonto)', async () => {
        const r = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: V2 })
        if (!r.success) throw new Error('setup')
        expect((await deleteTransfer(r.transferId)).success).toBe(true)
        expect(db.expenses).toHaveLength(0)
        expect(db.fun_income_entries).toHaveLength(0)
    })

    it('Löschen nimmt den Saldo des alten Spaßkontos zurück', async () => {
        const a = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: LEGACY })
        const b = await createTransfer({ direction: 'to_giro', amount: 5, reason: 'Eis', date: base.date, target: LEGACY })
        if (!a.success || !b.success) throw new Error('setup')
        expect(db.accounts[0].amount).toBe(115)
        await deleteTransfer(a.transferId)
        expect(db.accounts[0].amount).toBe(95)
        await deleteTransfer(b.transferId)
        expect(db.accounts[0].amount).toBe(100)
        expect(db.expenses).toHaveLength(0)
        expect(db.account_transactions).toHaveLength(0)
    })

    it('Löschen lässt andere Umbuchungen unberührt', async () => {
        const a = await createTransfer({ direction: 'from_giro', amount: 20, ...base, target: V2 })
        await createTransfer({ direction: 'from_giro', amount: 7, reason: 'Eis', date: base.date, target: V2 })
        if (!a.success) throw new Error('setup')
        await deleteTransfer(a.transferId)
        expect(db.expenses).toHaveLength(1)
        expect(db.expenses[0].amount).toBe(7)
        expect(db.fun_income_entries).toHaveLength(1)
    })
})
