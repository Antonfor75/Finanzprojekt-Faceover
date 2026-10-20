/**
 * Kassenbon-Scan (Web, Gemini): reine Regeln ohne Netz — Prüfung der Modell-Antwort, Felder für
 * Anzeige und Speichern, Reihenfolge der offenen Bons. Vorbild ist die Handy-App
 * (Cashflow-AndroidApp: utils/receiptLlm/validate.ts und pendingReceipts.ts), angepasst darauf,
 * dass Gemini das Bild selbst liest (es gibt keinen OCR-Text zum Gegenprüfen).
 */

export const RECEIPT_CATEGORIES = ['Essen', 'Schminki Schminki', 'Shoppi', 'Freizeit', 'Sparen', 'Sonstiges']

export type Finding = { code: string; severity: 'error' | 'warn'; message: string }

export type PendingItem = {
    nameRaw: string
    quantity: number
    unit: 'stk' | 'kg' | null
    unitPrice: number | null
    /** Zeilenpreis in Euro (negativ bei Pfand-Rückgabe/Rabatt). */
    totalPrice: number
}

/** Geprüftes Ergebnis der Auswertung, so wie es in pending_receipts.result steht. */
export type ReceiptResult = {
    store: string | null
    /** Tag als JJJJ-MM-TT. */
    date: string | null
    total: number | null
    category: string | null
    items: PendingItem[]
    ok: boolean
    /** Welches Modell den Bon gelesen hat (nur zur Info). */
    model?: string
    /** Token-Verbrauch der Auswertung (nur zur Info/Kostenkontrolle). */
    usage?: { input: number; output: number; thoughts: number; total: number }
}

export type ReceiptEdits = { store?: string; amount?: string; date?: string; category?: string; items?: PendingItem[] }

export type PendingStatus = 'reading' | 'ready' | 'failed'

/** Eine Zeile aus pending_receipts (Spalten wie in src/db/schema.ts). */
export type PendingReceiptRow = {
    id: string
    created_at: string
    status: PendingStatus
    started_at: string | null
    finished_at: string | null
    skipped_at: string | null
    image_paths: string[]
    result: ReceiptResult | null
    findings: Finding[]
    edits: ReceiptEdits
    error: string | null
    message: string | null
}

// ---------------------------------------------------------------- Prüfung der Gemini-Antwort

const ADDRESS_LIKE = /(stra(ß|ss)e|str\.|platz|weg|allee|gasse)\b|\b\d{5}\b/i

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Summen-, Zahlungs- und Steuerzeilen sind keine Artikel, auch wenn das Modell sie als Position ausgibt. */
const NON_ITEM = /(^| )(zu zahlen|summe|zwischensumme|gesamt|gesamtbetrag|total|kartenzahlung|karte|girocard|bar|barzahlung|rueckgeld|ruckgeld|mwst|ust|netto|brutto|steuer|eur|zahlung|bezahlt|gegeben)( |$)/

export function isNonItemName(name: string): boolean {
    return NON_ITEM.test(fold(name).replace(/[^a-z ]/g, ' '))
}

function asString(v: unknown): string | null {
    return typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null
}

/** Zahl aus der Antwort: Gemini liefert Zahlen, zur Sicherheit auch "12,34" als Text. */
function asNumber(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v !== 'string' || !v.trim()) return null
    const t = v.trim().replace(/\s|€/g, '')
    const negative = t.startsWith('-') || t.endsWith('-')
    const n = Number(t.replace(/-/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    return Number.isFinite(n) ? (negative ? -n : n) : null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const fmtEuro = (n: number) => n.toFixed(2).replace('.', ',')

/** "2026-10-05", "05.10.2026" oder "05.10.26" → "2026-10-05"; sonst null. */
export function toIsoDay(value: string): string | null {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(value.trim())
    let y: number, m: number, d: number
    if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    else if (de) [d, m, y] = [Number(de[1]), Number(de[2]), de[3].length === 2 ? 2000 + Number(de[3]) : Number(de[3])]
    else return null
    const date = new Date(Date.UTC(y, m - 1, d))
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Antwort von Gemini prüfen und in die Form der App bringen. Fehler (severity "error") bedeuten:
 * so nicht übernehmen, der Nutzer muss nachtragen. Warnungen sind Hinweise zum Prüfen.
 */
export function validateAnswer(answer: Record<string, unknown>, now: Date = new Date()): { result: ReceiptResult; findings: Finding[] } {
    const findings: Finding[] = []
    const add = (code: string, severity: Finding['severity'], message: string) => findings.push({ code, severity, message })

    if (answer.ist_kassenbon === false) add('not_a_receipt', 'error', 'Auf dem Bild ist kein Kassenbon zu erkennen.')

    // Laden
    const store = asString(answer.laden)
    if (!store) add('store_missing', 'warn', 'Laden nicht erkannt.')
    else if (ADDRESS_LIKE.test(store)) add('store_is_address', 'warn', `„${store}“ sieht nach einer Adresse aus, nicht nach einem Laden.`)

    // Summe
    let total = asNumber(answer.summe)
    if (total === null) add('sum_missing', 'error', 'Summe nicht erkannt.')
    else if (total <= 0) { add('sum_not_positive', 'error', `Summe ${fmtEuro(total)} € ist nicht positiv.`); total = null }
    else {
        total = round2(total)
        if (total > 5000) add('sum_large', 'warn', `Summe ${fmtEuro(total)} € ist ungewöhnlich hoch für einen Kassenbon.`)
    }

    // Datum
    let date: string | null = null
    const dateRaw = asString(answer.datum)
    if (!dateRaw) add('date_missing', 'warn', 'Datum nicht erkannt.')
    else {
        date = toIsoDay(dateRaw)
        if (!date) add('date_unparsable', 'warn', `„${dateRaw}“ ist kein Datum.`)
        else {
            const d = new Date(`${date}T12:00:00`)
            const oldest = new Date(now); oldest.setFullYear(oldest.getFullYear() - 10)
            const latest = new Date(now.getTime() + 2 * 86400000)
            if (d > latest) { add('date_future', 'warn', `Datum ${date} liegt in der Zukunft.`); date = null }
            else if (d < oldest) { add('date_old', 'warn', `Datum ${date} ist mehr als 10 Jahre alt.`); date = null }
        }
    }

    // Kategorie
    let category = asString(answer.kategorie)
    if (category && !RECEIPT_CATEGORIES.includes(category)) {
        add('category_unknown', 'warn', `Kategorie „${category}“ gibt es nicht.`)
        category = null
    }

    // Artikel
    const items: PendingItem[] = []
    let dropped = 0
    for (const entry of Array.isArray(answer.artikel) ? answer.artikel : []) {
        const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
        const name = asString(e.name)
        const price = asNumber(e.preis)
        if (!name || price === null || price === 0 || isNonItemName(name)) { dropped++; continue }
        const q = asNumber(e.menge)
        const quantity = q !== null && q > 0 ? q : 1
        const totalPrice = round2(price)
        items.push({
            nameRaw: name,
            quantity,
            unit: e.einheit === 'kg' ? 'kg' : null,
            unitPrice: quantity !== 1 ? round2(totalPrice / quantity) : null,
            totalPrice,
        })
    }
    if (dropped > 0) add('items_dropped', 'warn', `${dropped} Zeile${dropped === 1 ? '' : 'n'} ohne Preis oder ohne Artikel (z. B. Summe, Zahlung) wurde${dropped === 1 ? '' : 'n'} weggelassen.`)

    if (total !== null && items.length > 0) {
        const sum = round2(itemsTotal(items))
        if (Math.abs(sum - total) > 0.02) {
            add('items_sum_mismatch', 'warn', `Artikelsumme ${fmtEuro(sum)} € weicht vom Gesamtbetrag ${fmtEuro(total)} € ab — bitte Artikel prüfen.`)
        }
    }

    const ok = total !== null && !findings.some((f) => f.severity === 'error')
    return { result: { store, date, total, category, items, ok }, findings }
}

/** Summe der Artikel — für den Abgleich mit dem Gesamtbetrag. */
export function itemsTotal(items: { totalPrice: number }[]): number {
    return items.reduce((sum, i) => sum + (Number(i.totalPrice) || 0), 0)
}

// ---------------------------------------------------------------- Felder (Anzeige und Speichern teilen sich die Regeln)

export type Fields = {
    store: string
    amount: string
    date: string
    category: string
    items: PendingItem[]
    /** Welche Felder vom Agenten stammen; von Hand geänderte Felder gelten nie als "vom Agenten". */
    fromAgent: { store: boolean; amount: boolean; date: boolean; category: boolean; items: boolean }
}

const fmtAmount = (n: number) => n.toFixed(2).replace('.', ',')
const localDay = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Welche Felder gelten gerade? Ergebnis des Agenten, darüber alles, was man von Hand geändert hat. */
export function deriveFields(row: Pick<PendingReceiptRow, 'result' | 'edits'>, today: () => string = localDay): Fields {
    const f: Fields = {
        store: '',
        amount: '',
        date: today(),
        category: 'Essen',
        items: [],
        fromAgent: { store: false, amount: false, date: false, category: false, items: false },
    }

    const r = row.result
    if (r) {
        if (r.store) { f.store = r.store; f.fromAgent.store = true }
        if (r.total !== null) { f.amount = fmtAmount(r.total); f.fromAgent.amount = true }
        if (r.date) { f.date = r.date; f.fromAgent.date = true }
        if (r.category && RECEIPT_CATEGORIES.includes(r.category)) { f.category = r.category; f.fromAgent.category = true }
        if (r.items.length > 0) { f.items = r.items; f.fromAgent.items = true }
    }

    const e = row.edits ?? {}
    if (e.store !== undefined) { f.store = e.store; f.fromAgent.store = false }
    if (e.amount !== undefined) { f.amount = e.amount; f.fromAgent.amount = false }
    if (e.date !== undefined) { f.date = e.date; f.fromAgent.date = false }
    if (e.category !== undefined) { f.category = e.category; f.fromAgent.category = false }
    if (e.items !== undefined) { f.items = e.items; f.fromAgent.items = false }
    return f
}

/** Betrag aus dem Eingabefeld ("12,34") → Zahl; NaN, wenn nichts Sinnvolles drinsteht. */
export function parseAmountInput(value: string): number {
    return parseFloat(value.trim().replace(/\s|€/g, '').replace(',', '.'))
}

// ---------------------------------------------------------------- Zustand und Reihenfolge

/** Länger als das hier "liest" ein Bon nicht — sonst ist die Auswertung abgebrochen (Seite geschlossen, Zeitlimit). */
export const STALE_READING_MS = 3 * 60 * 1000

/** Ist die Auswertung hängen geblieben? Dann darf man neu starten oder selbst eintragen. */
export function isStale(row: Pick<PendingReceiptRow, 'status' | 'started_at' | 'created_at'>, now: number = Date.now()): boolean {
    if (row.status !== 'reading') return false
    const since = Date.parse(row.started_at ?? row.created_at)
    return Number.isFinite(since) && now - since > STALE_READING_MS
}

export const isActive = (r: PendingReceiptRow, now: number = Date.now()): boolean => r.status === 'reading' && !isStale(r, now)
export const isOpen = (r: PendingReceiptRow, now: number = Date.now()): boolean => !isActive(r, now)

/** Zuerst die, die noch nie ignoriert wurden (neueste vorn), dann die ignorierten (am längsten her zuerst). */
export function orderOpen(list: PendingReceiptRow[], now: number = Date.now()): PendingReceiptRow[] {
    return list.filter((r) => isOpen(r, now)).sort((a, b) => {
        if (!a.skipped_at !== !b.skipped_at) return a.skipped_at ? 1 : -1
        if (a.skipped_at && b.skipped_at) return a.skipped_at.localeCompare(b.skipped_at)
        return b.created_at.localeCompare(a.created_at)
    })
}

// ---------------------------------------------------------------- Freischaltung

export { hasReceiptScan } from './access'
