import { describe, it, expect } from 'vitest'
import { nameSimilarity, scoreReceipt, summarize, type ExpectedReceipt } from './evalScore'

const expected: ExpectedReceipt = {
    file: 'lidl.jpg', store: 'Lidl', date: '2026-10-01', total: 3.41, category: 'Essen',
    items: [
        { name: 'Schokodonut', quantity: 1, price: 0.59 },
        { name: 'Schi-Käse-Crois', quantity: 2, price: 1.58 },
        { name: 'Pfand', quantity: 1, price: 0.25 },
    ],
}
const item = (nameRaw: string, totalPrice: number, quantity = 1) => ({ nameRaw, totalPrice, quantity, unit: null, unitPrice: null })

describe('nameSimilarity', () => {
    it('ignoriert Groß-/Kleinschreibung, Satzzeichen und Umlaute', () => {
        expect(nameSimilarity('Schi-Käse-Crois', 'SCHI KAESE CROIS')).toBeGreaterThan(0.6)
        expect(nameSimilarity("McDonald's", 'MCDONALDS')).toBe(1)
        expect(nameSimilarity('Pfand', 'Apfelschorle')).toBeLessThan(0.5)
    })
})

describe('scoreReceipt', () => {
    it('alles richtig → perfekt', () => {
        const s = scoreReceipt(expected, {
            store: 'LIDL', date: '2026-10-01', total: 3.41, category: 'Essen',
            items: [item('Schokodonut', 0.59), item('Schi-Käse-Crois', 1.58, 2), item('Pfand 0,25', 0.25)],
        })
        expect(s).toMatchObject({ perfect: true, itemsCorrect: 3, quantitiesCorrect: 3, missing: [], extra: [] })
    })

    it('verrutschte Preise zählen als fehlend + erfunden', () => {
        // So hat Flash-Lite den schrägen Lidl-Bon gelesen.
        const s = scoreReceipt(expected, {
            store: 'Lidl', date: '2026-10-01', total: 3.41, category: 'Essen',
            items: [item('Schokodonut', 1.58, 0.79), item('Schi-Käse-Crois', 0.65), item('Pfand', 0.25)],
        })
        expect(s.perfect).toBe(false)
        expect(s.itemsCorrect).toBe(1)
        expect(s.missing).toHaveLength(2)
        expect(s.extra).toHaveLength(2)
    })

    it('falsche Menge bei richtigem Preis', () => {
        const s = scoreReceipt(expected, {
            store: 'Lidl', date: '2026-10-01', total: 3.41, category: 'Essen',
            items: [item('Schokodonut', 0.59), item('Schi-Käse-Crois', 1.58, 1), item('Pfand', 0.25)],
        })
        expect(s.itemsCorrect).toBe(3)
        expect(s.quantitiesCorrect).toBe(2)
    })

    it('Beleg ohne Artikel: erfundene Artikel fallen auf', () => {
        const s = scoreReceipt({ ...expected, items: [] }, { store: 'Lidl', date: '2026-10-01', total: 3.41, category: 'Essen', items: [item('Kartenzahlung', 3.41)] })
        expect(s.extra).toEqual(['Kartenzahlung (3.41)'])
        expect(s.perfect).toBe(false)
    })

    it('Zusammenfassung', () => {
        const a = scoreReceipt(expected, { store: 'Lidl', date: '2026-10-01', total: 3.41, category: 'Essen', items: [item('Schokodonut', 0.59), item('Schi-Käse-Crois', 1.58, 2), item('Pfand', 0.25)] })
        const b = scoreReceipt(expected, { store: null, date: null, total: null, category: null, items: [] })
        expect(summarize([a, b])).toMatchObject({ bons: 2, perfekt: 1, summe: 1, artikelRichtig: 3, artikelSoll: 6 })
    })
})
