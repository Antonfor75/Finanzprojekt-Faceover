import { describe, it, expect } from 'vitest'
import { analyzeReceipt, needsReview, reviewFeedback, sumGap } from './analyze'
import type { extractReceipt } from './gemini'

const NOW = new Date('2026-10-20T12:00:00')
const file = { mimeType: 'image/jpeg', base64: 'AAAA' }

const lidl = (artikel: { name: string; menge?: number; preis: number }[], summe = 3.41) => ({
    ist_kassenbon: true, laden: 'Lidl', datum: '2026-10-01', summe, kategorie: 'Essen', artikel,
})
// So hat Flash-Lite den schrägen Lidl-Bon gelesen (Preisspalte verrutscht).
const WRONG = lidl([
    { name: 'Apfelschorle', preis: 0.39 }, { name: 'Rabatt Getränke', preis: -0.05 }, { name: 'Pfand 0,25 EM', preis: 0.25 },
    { name: 'Schokodonut', menge: 0.79, preis: 1.58 }, { name: 'Schi-Käse-Crois', preis: 0.65 }, { name: 'Schokobrötchen', preis: 3.41 },
])
const RIGHT = lidl([
    { name: 'Apfelschorle', preis: 0.39 }, { name: 'Rabatt Getränke', preis: -0.05 }, { name: 'Pfand 0,25 EM', preis: 0.25 },
    { name: 'Schokodonut', preis: 0.59 }, { name: 'Schi-Käse-Crois', menge: 2, preis: 1.58 }, { name: 'Schokobrötchen', preis: 0.65 },
])

type Call = Parameters<typeof extractReceipt>[1]
function fakeExtract(answers: (Record<string, unknown> | Error)[]) {
    const calls: Call[] = []
    const fn = (async (_files, opts) => {
        calls.push(opts)
        const a = answers[calls.length - 1]
        if (!a || a instanceof Error) throw a ?? new Error('keine Antwort')
        return { answer: a, text: JSON.stringify(a), model: calls.length === 1 ? 'gemini-flash-lite-latest' : 'gemini-flash-latest', usage: { input: 1000, output: 200, thoughts: 0, total: 1200 } }
    }) as typeof extractReceipt
    return { fn, calls }
}

describe('sumGap / needsReview', () => {
    it('erkennt verrutschte Preise, ignoriert Rundung', () => {
        expect(sumGap({ total: 3.41, items: [{ totalPrice: 3.4 }] as never })).toBe(0.01)
        expect(needsReview({ result: { total: 3.41, items: [{ totalPrice: 6.23 }] } as never, findings: [] })).toBe(true)
        expect(needsReview({ result: { total: 3.41, items: [{ totalPrice: 3.4 }] } as never, findings: [] })).toBe(false)
        expect(needsReview({ result: { total: 3.91, items: [] } as never, findings: [] })).toBe(false) // Beleg ohne Artikel
    })

    it('Rückfrage nennt beide Beträge', () => {
        const text = reviewFeedback({ total: 3.41, items: [{ totalPrice: 6.23 }] as never })
        expect(text).toContain('6,23 €')
        expect(text).toContain('3,41 €')
    })
})

describe('analyzeReceipt', () => {
    it('passt alles, wird nicht nachgefragt (kein Extra-Kontingent)', async () => {
        const { fn, calls } = fakeExtract([RIGHT])
        const out = await analyzeReceipt([file], { extract: fn, now: NOW })
        expect(calls).toHaveLength(1)
        expect(out.review).toBe('none')
        expect(out.result.ok).toBe(true)
    })

    it('Summen-Abweichung → Rückfrage mit eigener Antwort, bessere Lesung wird übernommen', async () => {
        const { fn, calls } = fakeExtract([WRONG, RIGHT])
        const out = await analyzeReceipt([file], { extract: fn, now: NOW })
        expect(calls).toHaveLength(2)
        expect(calls[1]?.followUp?.previousAnswer).toBe(JSON.stringify(WRONG))
        expect(calls[1]?.followUp?.feedback).toContain('6,23 €')
        expect(out.review).toBe('improved')
        expect(out.result.items.find((i) => i.nameRaw === 'Schokobrötchen')?.totalPrice).toBe(0.65)
        expect(out.findings[0].code).toBe('self_corrected')
        expect(out.findings.some((f) => f.code === 'items_sum_mismatch')).toBe(false)
        expect(out.usage?.total).toBe(2400)
        // Die erste Lesung bleibt zum Vergleich erhalten.
        expect(out.first.findings.some((f) => f.code === 'items_sum_mismatch')).toBe(true)
    })

    it('wird es nicht besser, bleibt die erste Lesung samt Warnung', async () => {
        const { fn } = fakeExtract([WRONG, WRONG])
        const out = await analyzeReceipt([file], { extract: fn, now: NOW })
        expect(out.review).toBe('unchanged')
        expect(out.findings.some((f) => f.code === 'items_sum_mismatch')).toBe(true)
    })

    it('Artikel einfach weglassen gilt nicht als Verbesserung', async () => {
        const { fn } = fakeExtract([WRONG, lidl([])])
        const out = await analyzeReceipt([file], { extract: fn, now: NOW })
        expect(out.review).toBe('unchanged')
        expect(out.result.items).toHaveLength(6)
    })

    it('scheitert die Rückfrage (Kontingent/Zeit), bleibt die erste Lesung', async () => {
        const { fn } = fakeExtract([WRONG, new Error('429')])
        const out = await analyzeReceipt([file], { extract: fn, now: NOW })
        expect(out.review).toBe('skipped')
        expect(out.result.total).toBe(3.41)
    })

    it('reicht die Frist an jeden Aufruf weiter', async () => {
        const { fn, calls } = fakeExtract([WRONG, RIGHT])
        await analyzeReceipt([file], { extract: fn, now: NOW, deadlineAt: 123 })
        expect(calls.map((c) => c?.deadlineAt)).toEqual([123, 123])
    })
})
