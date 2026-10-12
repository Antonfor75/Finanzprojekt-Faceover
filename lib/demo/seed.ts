// Beispieldaten für den Demo-Modus. Sie werden RELATIV ZU HEUTE erzeugt (ca. 10
// Wochen Verlauf), mit festem Zufalls-Startwert — die Demo sieht also immer
// frisch aus und ist trotzdem bei jedem Zurücksetzen gleich aufgebaut.
import { PRIVACY_VERSION } from '@/lib/legal/operator'

type Row = Record<string, unknown>

export type DemoTables = {
    expenses: Row[]
    fixed_costs: Row[]
    accounts: Row[]
    settings: Row[]
    income_sources: Row[]
    receipt_items: Row[]
    products: Row[]
    account_transactions: Row[]
    fun_accounts_v2: Row[]
    fun_groups: Row[]
    fun_group_expenses: Row[]
    fun_income_entries: Row[]
}

export const DEMO_USER = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'demo@beispiel.de',
    user_metadata: { privacy_version: PRIVACY_VERSION },
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T12:00:00.000Z',
}

const WEEKS = 10

// Kleiner deterministischer Zufallsgenerator (mulberry32).
function rng(seed: number) {
    let a = seed
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Mittags normalisiert — wie in utils/girokonto.ts, gegen DST-/Mitternachtsfehler. */
function noon(d: Date): Date {
    const n = new Date(d)
    n.setHours(12, 0, 0, 0)
    return n
}

function addDays(d: Date, days: number): Date {
    const n = new Date(d)
    n.setDate(n.getDate() + days)
    return noon(n)
}

function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(d: Date): string {
    return ymd(d).slice(0, 7)
}

const round2 = (n: number) => Math.round(n * 100) / 100

type Template = { description: string; category: string; min: number; max: number; weight: number }

const TEMPLATES: Template[] = [
    { description: 'Supermarkt', category: 'Essen', min: 12, max: 48, weight: 6 },
    { description: 'Bäckerei', category: 'Essen', min: 3, max: 9, weight: 4 },
    { description: 'Mittagessen', category: 'Essen', min: 8, max: 15, weight: 3 },
    { description: 'Lieferdienst', category: 'Essen', min: 18, max: 32, weight: 1 },
    { description: 'Café', category: 'Freizeit', min: 4, max: 11, weight: 3 },
    { description: 'Kino', category: 'Freizeit', min: 11, max: 24, weight: 1 },
    { description: 'Bar mit Freunden', category: 'Freizeit', min: 15, max: 40, weight: 1 },
    { description: 'Drogerie', category: 'Schminki Schminki', min: 6, max: 28, weight: 2 },
    { description: 'Kleidung', category: 'Shoppi', min: 20, max: 65, weight: 1 },
    { description: 'Tanken', category: 'Sonstiges', min: 35, max: 70, weight: 1 },
    { description: 'Apotheke', category: 'Sonstiges', min: 5, max: 18, weight: 1 },
]

const TOTAL_WEIGHT = TEMPLATES.reduce((s, t) => s + t.weight, 0)

function pickTemplate(r: () => number): Template {
    let x = r() * TOTAL_WEIGHT
    for (const t of TEMPLATES) {
        x -= t.weight
        if (x <= 0) return t
    }
    return TEMPLATES[0]
}

const REWE_ITEMS = [
    { name_raw: 'JA! VOLLMILCH 3,5%', product: 'Milch', price: 0.99 },
    { name_raw: 'BIO BANANEN', product: 'Bananen', price: 1.79 },
    { name_raw: 'REWE BESTE WAHL PASTA', product: 'Nudeln', price: 1.49 },
    { name_raw: 'JA! TOMATENSOSSE', product: 'Tomatensoße', price: 0.89 },
    { name_raw: 'GOUDA JUNG SCHEIBEN', product: 'Käse', price: 2.29 },
    { name_raw: 'VOLLKORNBROT', product: 'Brot', price: 1.99 },
]

export function createDemoSeed(today: Date = new Date()): DemoTables {
    const r = rng(20261012)
    const now = noon(today)
    const start = addDays(now, -WEEKS * 7)
    const startIso = start.toISOString()
    const iso = (d: Date) => noon(d).toISOString()
    const user_id = DEMO_USER.id

    // --- Einnahmen & Fixkosten -------------------------------------------------
    const income_sources: Row[] = [
        { id: 1, title: 'Gehalt', amount: 2400, frequency: 'monthly', execution_day: 1, valid_from: startIso, valid_to: null },
        { id: 2, title: 'Nebenjob', amount: 450, frequency: 'monthly', execution_day: 15, valid_from: startIso, valid_to: null },
    ]

    const fixed_costs: Row[] = [
        { id: 1, title: 'Miete', amount: 850, frequency: 'monthly', execution_day: 1, valid_from: startIso, valid_to: null, linked_account_id: null },
        { id: 2, title: 'Handyvertrag', amount: 24.99, frequency: 'monthly', execution_day: 5, valid_from: startIso, valid_to: null, linked_account_id: null },
        { id: 3, title: 'Streaming', amount: 12.99, frequency: 'monthly', execution_day: 10, valid_from: startIso, valid_to: null, linked_account_id: null },
        { id: 4, title: 'Fitnessstudio', amount: 29.9, frequency: 'monthly', execution_day: 1, valid_from: startIso, valid_to: null, linked_account_id: null },
        { id: 5, title: 'Haftpflichtversicherung', amount: 65, frequency: 'yearly', execution_day: 1, valid_from: startIso, valid_to: null, linked_account_id: null },
        { id: 6, title: 'Sparrate Urlaub', amount: 100, frequency: 'monthly', execution_day: 1, valid_from: startIso, valid_to: null, linked_account_id: 1 },
    ]

    // --- Konten ----------------------------------------------------------------
    // processed_month = aktueller Monat, damit die Verteil-Logik beim Start nichts bucht.
    const accounts: Row[] = [
        { id: 1, name: 'Urlaub', amount: 1150, start_amount: 800, target_amount: 2000, target_date: iso(addDays(now, 240)), months: 0, type: 'savings', processed_month: monthKey(now), valid_from: startIso },
        { id: 2, name: 'Weihnachtsgeld', amount: 600, start_amount: 600, months: 3, type: 'distribution', processed_month: monthKey(now), valid_from: startIso },
    ]

    const account_transactions: Row[] = [
        { id: 1, account_id: 1, amount: 800, type: 'manual_deposit', note: 'Startguthaben', transaction_date: startIso },
        { id: 2, account_id: 1, amount: 100, type: 'auto_deposit', note: 'Sparrate', transaction_date: iso(addDays(start, 21)) },
        { id: 3, account_id: 1, amount: 100, type: 'auto_deposit', note: 'Sparrate', transaction_date: iso(addDays(start, 51)) },
        { id: 4, account_id: 1, amount: 150, type: 'manual_deposit', note: 'Geburtstagsgeld', transaction_date: iso(addDays(now, -9)) },
    ]

    const settings: Row[] = [
        { id: 1, monthly_budget: 0, savings_balance: 0, savings_months_remaining: 0, last_processed_month: monthKey(now), last_processed_week: null },
    ]

    // --- Variable Ausgaben -----------------------------------------------------
    const expenses: Row[] = []
    const receipt_items: Row[] = []
    const products: Row[] = REWE_ITEMS.map((it, i) => ({ id: i + 1, name: it.product, category: null }))
    let expenseId = 0
    let itemId = 0

    for (let day = 0; day <= WEEKS * 7; day++) {
        const date = addDays(start, day)
        const count = r() < 0.2 ? 0 : r() < 0.7 ? 1 : 2
        for (let i = 0; i < count; i++) {
            const t = pickTemplate(r)
            const amount = round2(t.min + r() * (t.max - t.min))
            expenses.push({ id: ++expenseId, description: t.description, amount, expense_date: ymd(date), category: t.category, account_id: null, created_at: iso(date) })
        }

        // Jeden Samstag ein REWE-Einkauf mit Bon-Artikeln.
        if (date.getDay() === 6) {
            const picked = REWE_ITEMS.filter(() => r() < 0.7)
            const items = picked.length ? picked : REWE_ITEMS.slice(0, 2)
            const id = ++expenseId
            let total = 0
            for (const it of items) {
                const qty = r() < 0.3 ? 2 : 1
                const price = round2(it.price * qty)
                total += price
                receipt_items.push({
                    id: ++itemId, expense_id: id, product_id: REWE_ITEMS.indexOf(it) + 1, name_raw: it.name_raw,
                    quantity: qty, unit: 'stk', unit_price: it.price, total_price: price, source: 'rewe',
                })
            }
            expenses.push({ id, description: 'REWE', amount: round2(total), expense_date: ymd(date), category: 'Essen', account_id: null, created_at: iso(date) })
        }
    }

    // Heute immer ein Eintrag — sonst startet die Demo am Montag mit „0 € ausgegeben“.
    expenses.push({ id: ++expenseId, description: 'Bäckerei', amount: 4.6, expense_date: ymd(now), category: 'Essen', account_id: null, created_at: iso(now) })

    // Eine Ausgabe, die vom Sparkonto bezahlt wurde (budgetneutral).
    expenses.push({ id: ++expenseId, description: 'Konto: Urlaub', amount: 150, expense_date: ymd(addDays(now, -20)), category: 'Konto: Urlaub', account_id: 1, created_at: iso(addDays(now, -20)) })

    // --- Spaßkonto -------------------------------------------------------------
    const fun_accounts_v2: Row[] = [{ id: 1, name: 'Spaßkonto', foresight_enabled: true }]
    const fun_groups: Row[] = [
        { id: 1, fun_account_id: 1, name: 'Konzerte', start_date: ymd(addDays(now, -40)), end_date: null },
        { id: 2, fun_account_id: 1, name: 'Städtetrip Hamburg', start_date: ymd(addDays(now, 14)), end_date: ymd(addDays(now, 17)) },
    ]
    const fun_income_entries: Row[] = [
        { id: 1, fun_account_id: 1, group_id: null, amount: 300, description: 'Startguthaben', income_date: ymd(addDays(now, -45)) },
        { id: 2, fun_account_id: 1, group_id: 2, amount: 120, description: 'Zuschuss von Oma', income_date: ymd(addDays(now, -6)) },
    ]
    const fun_group_expenses: Row[] = [
        { id: 1, fun_account_id: 1, group_id: 1, amount: 65, description: 'Konzertkarte', expense_date: ymd(addDays(now, -25)) },
        { id: 2, fun_account_id: 1, group_id: 2, amount: 89, description: 'Zugtickets', expense_date: ymd(addDays(now, -3)) },
        { id: 3, fun_account_id: 1, group_id: 2, amount: 180, description: 'Hotel (geplant)', expense_date: ymd(addDays(now, 14)) },
    ]

    const withUser = (rows: Row[]) => rows.map(row => ({ created_at: startIso, ...row, user_id }))

    return {
        expenses: withUser(expenses),
        fixed_costs: withUser(fixed_costs),
        accounts: withUser(accounts),
        settings: withUser(settings),
        income_sources: withUser(income_sources),
        receipt_items: withUser(receipt_items),
        products: withUser(products),
        account_transactions: withUser(account_transactions),
        fun_accounts_v2: withUser(fun_accounts_v2),
        fun_groups: withUser(fun_groups),
        fun_group_expenses: withUser(fun_group_expenses),
        fun_income_entries: withUser(fun_income_entries),
    }
}
