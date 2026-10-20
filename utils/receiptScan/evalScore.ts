import type { ReceiptResult } from './fields'

/**
 * Bewertung der Bon-Auswertung gegen von Hand abgelesene Sollwerte (scripts/receipt-eval).
 * Reine Funktion, damit Prompt- oder Modell-Änderungen mit Zahlen statt Bauchgefühl verglichen werden.
 */

export type ExpectedItem = { name: string; quantity: number; price: number }
export type ExpectedReceipt = {
    file: string
    store: string
    date: string
    total: number
    category: string
    items: ExpectedItem[]
}

export type ReceiptScore = {
    store: boolean
    date: boolean
    total: boolean
    category: boolean
    /** Artikel mit richtigem Preis UND passendem Namen. */
    itemsCorrect: number
    itemsExpected: number
    /** Davon auch mit richtiger Menge. */
    quantitiesCorrect: number
    /** Sollartikel, die fehlen oder einen falschen Preis haben. */
    missing: string[]
    /** Gelesene Artikel ohne Gegenstück im Soll (erfunden oder falsch zugeordnet). */
    extra: string[]
    /** Alles richtig: Kopf, Kategorie, jeder Artikel, nichts Erfundenes. */
    perfect: boolean
}

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '')

/** Ähnlichkeit zweier Namen 0..1 (Dice über Buchstabenpaare, unabhängig von Satzzeichen/Groß-klein). */
export function nameSimilarity(a: string, b: string): number {
    const x = fold(a)
    const y = fold(b)
    if (!x || !y) return 0
    if (x === y || x.includes(y) || y.includes(x)) return 1
    const pairs = (s: string) => {
        const m = new Map<string, number>()
        for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1)
        return m
    }
    const px = pairs(x)
    const py = pairs(y)
    let common = 0
    for (const [k, n] of px) common += Math.min(n, py.get(k) ?? 0)
    return (2 * common) / (x.length - 1 + y.length - 1)
}

const samePrice = (a: number, b: number) => Math.abs(a - b) < 0.005
const NAME_OK = 0.5

export function scoreReceipt(expected: ExpectedReceipt, actual: Pick<ReceiptResult, 'store' | 'date' | 'total' | 'category' | 'items'>): ReceiptScore {
    const store = !!actual.store && nameSimilarity(expected.store, actual.store) >= 0.8
    const date = actual.date === expected.date
    const total = actual.total !== null && samePrice(actual.total, expected.total)
    const category = actual.category === expected.category

    const unused = actual.items.map((it, i) => ({ it, i }))
    let itemsCorrect = 0
    let quantitiesCorrect = 0
    const missing: string[] = []
    for (const e of expected.items) {
        // Bester Kandidat mit gleichem Preis und ähnlichem Namen.
        let best = -1
        let bestSim = NAME_OK
        unused.forEach(({ it }, k) => {
            if (!samePrice(it.totalPrice, e.price)) return
            const sim = nameSimilarity(e.name, it.nameRaw)
            if (sim >= bestSim) { best = k; bestSim = sim }
        })
        if (best < 0) { missing.push(`${e.name} (${e.price.toFixed(2)})`); continue }
        itemsCorrect++
        if (Math.abs(unused[best].it.quantity - e.quantity) < 0.0005) quantitiesCorrect++
        unused.splice(best, 1)
    }
    const extra = unused.map(({ it }) => `${it.nameRaw} (${it.totalPrice.toFixed(2)})`)

    return {
        store, date, total, category,
        itemsCorrect, itemsExpected: expected.items.length, quantitiesCorrect,
        missing, extra,
        perfect: store && date && total && category && missing.length === 0 && extra.length === 0,
    }
}

/** Zusammenfassung über alle Bons — eine Zeile pro Kennzahl. */
export function summarize(scores: ReceiptScore[]) {
    const count = (f: (s: ReceiptScore) => boolean) => scores.filter(f).length
    const sum = (f: (s: ReceiptScore) => number) => scores.reduce((n, s) => n + f(s), 0)
    return {
        bons: scores.length,
        perfekt: count((s) => s.perfect),
        laden: count((s) => s.store),
        datum: count((s) => s.date),
        summe: count((s) => s.total),
        kategorie: count((s) => s.category),
        artikelRichtig: sum((s) => s.itemsCorrect),
        artikelSoll: sum((s) => s.itemsExpected),
        mengenRichtig: sum((s) => s.quantitiesCorrect),
        erfunden: sum((s) => s.extra.length),
    }
}
