// Ein Supabase-ähnlicher Client für den Demo-Modus, der ausschließlich im
// localStorage des Browsers arbeitet. Er bildet nur die Abfrage-Ketten nach, die
// die App tatsächlich benutzt (select/insert/update/delete mit eq, neq, is, in,
// order, limit, single, maybeSingle). Unbekanntes führt zu einem klaren Fehler
// im Rückgabewert — nie zu einem Netzwerkaufruf.
import { createDemoSeed, DEMO_USER, type DemoTables } from './seed'

export const DEMO_STORAGE_KEY = 'cashflow-demo:v1'

export type Row = Record<string, unknown>
type DemoError = { message: string; code?: string }
type Result = { data: unknown; error: DemoError | null; count?: number | null }

type Store = { version: 1; tables: DemoTables; seq: Record<string, number> }

let store: Store | null = null

function buildStore(): Store {
    const tables = createDemoSeed()
    const seq: Record<string, number> = {}
    for (const [name, rows] of Object.entries(tables)) {
        seq[name] = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0)
    }
    return { version: 1, tables, seq }
}

function readStorage(): Store | null {
    try {
        const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Store
        return parsed?.version === 1 && parsed.tables && parsed.seq ? parsed : null
    } catch {
        return null
    }
}

function persist(): void {
    if (!store) return
    try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store))
    } catch {
        // Privater Modus / voller Speicher: die Demo läuft dann nur im Arbeitsspeicher weiter.
    }
}

function getStore(): Store {
    if (!store) {
        store = (typeof window !== 'undefined' && readStorage()) || buildStore()
        persist()
    }
    return store
}

/** Setzt die Demo auf die Beispieldaten zurück. */
export function resetDemoData(): void {
    store = buildStore()
    persist()
}

/** Nur für Tests: vergisst den Zwischenspeicher, damit neu aus dem localStorage gelesen wird. */
export function _forgetDemoCache(): void {
    store = null
}

function same(a: unknown, b: unknown): boolean {
    if (a === null || a === undefined || b === null || b === undefined) return a == b
    return String(a) === String(b)
}

function compare(a: unknown, b: unknown): number {
    if (a === b) return 0
    if (a === null || a === undefined) return 1
    if (b === null || b === undefined) return -1
    // Zahlen (auch numerische Strings wie bei Postgres-numeric) numerisch,
    // alles andere — z. B. ISO-Datumsstrings — lexikografisch.
    const isNum = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
    if (isNum(a) && isNum(b)) return Number(a) - Number(b)
    return String(a) < String(b) ? -1 : 1
}

function project(row: Row, columns: string): Row {
    const cols = columns.split(',').map(c => c.trim()).filter(Boolean)
    if (cols.length === 0 || cols.includes('*')) return { ...row }
    const out: Row = {}
    for (const c of cols) out[c] = row[c] ?? null
    return out
}

class DemoQuery implements PromiseLike<Result> {
    private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private filters: ((r: Row) => boolean)[] = []
    private orders: { column: string; ascending: boolean }[] = []
    private max: number | null = null
    private columns = '*'
    private returning = false
    private cardinality: 'many' | 'single' | 'maybeSingle' = 'many'
    private payload: Row[] | Row | null = null

    constructor(private table: string) {}

    select(columns = '*') {
        if (this.op === 'select') this.columns = columns
        else { this.returning = true; this.columns = columns }
        return this
    }
    insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
    update(patch: Row) { this.op = 'update'; this.payload = patch; return this }
    delete() { this.op = 'delete'; return this }

    eq(column: string, value: unknown) { this.filters.push(r => same(r[column], value)); return this }
    neq(column: string, value: unknown) { this.filters.push(r => !same(r[column], value)); return this }
    is(column: string, value: unknown) { this.filters.push(r => (r[column] ?? null) === value); return this }
    in(column: string, values: unknown[]) { this.filters.push(r => values.some(v => same(r[column], v))); return this }
    gt(column: string, value: unknown) { this.filters.push(r => compare(r[column], value) > 0); return this }
    gte(column: string, value: unknown) { this.filters.push(r => compare(r[column], value) >= 0); return this }
    lt(column: string, value: unknown) { this.filters.push(r => compare(r[column], value) < 0); return this }
    lte(column: string, value: unknown) { this.filters.push(r => compare(r[column], value) <= 0); return this }
    order(column: string, opts?: { ascending?: boolean }) {
        this.orders.push({ column, ascending: opts?.ascending !== false })
        return this
    }
    limit(n: number) { this.max = n; return this }
    single() { this.cardinality = 'single'; return this }
    maybeSingle() { this.cardinality = 'maybeSingle'; return this }

    then<T1 = Result, T2 = never>(
        onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ): PromiseLike<T1 | T2> {
        return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected)
    }

    private execute(): Result {
        const s = getStore()
        const rows = s.tables[this.table as keyof DemoTables] as Row[] | undefined
        if (!rows) {
            return { data: null, error: { message: `Demo: Tabelle "${this.table}" gibt es hier nicht.`, code: '42P01' } }
        }
        const matches = (r: Row) => this.filters.every(f => f(r))
        let out: Row[] = []

        if (this.op === 'select') {
            out = rows.filter(matches)
        } else if (this.op === 'insert') {
            const now = new Date().toISOString()
            for (const input of this.payload as Row[]) {
                s.seq[this.table] = (s.seq[this.table] || 0) + 1
                const row: Row = { created_at: now, user_id: DEMO_USER.id, ...input, id: s.seq[this.table] }
                rows.push(row)
                out.push(row)
            }
            persist()
        } else if (this.op === 'update') {
            for (const r of rows) {
                if (matches(r)) {
                    Object.assign(r, this.payload, { id: r.id })
                    out.push(r)
                }
            }
            persist()
        } else {
            const keep: Row[] = []
            for (const r of rows) (matches(r) ? out : keep).push(r)
            ;(s.tables as Record<string, Row[]>)[this.table] = keep
            persist()
        }

        if (this.op !== 'select' && !this.returning) return { data: null, error: null }

        for (const { column, ascending } of [...this.orders].reverse()) {
            out = [...out].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]))
        }
        if (this.max !== null) out = out.slice(0, this.max)
        const data = out.map(r => project(r, this.columns))

        if (this.cardinality === 'single') {
            if (data.length !== 1) {
                return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
            }
            return { data: data[0], error: null }
        }
        if (this.cardinality === 'maybeSingle') {
            if (data.length > 1) {
                return { data: null, error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116' } }
            }
            return { data: data[0] ?? null, error: null }
        }
        return { data, error: null }
    }
}

const notAvailable = { message: 'In der Demo nicht verfügbar.' }

function leaveDemo() {
    if (typeof window !== 'undefined') window.location.href = '/'
}

const demoClient = {
    from: (table: string) => new DemoQuery(table),
    rpc: async () => ({ data: null, error: notAvailable }),
    auth: {
        getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
        getSession: async () => ({ data: { session: { user: DEMO_USER } }, error: null }),
        // „Abmelden“ beendet in der Demo einfach die Demo.
        signOut: async () => { leaveDemo(); return { error: null } },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        updateUser: async () => ({ data: { user: DEMO_USER }, error: null }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: notAvailable }),
        resetPasswordForEmail: async () => ({ data: null, error: notAvailable }),
    },
}

export type DemoClient = typeof demoClient

export function getDemoClient(): DemoClient {
    return demoClient
}
