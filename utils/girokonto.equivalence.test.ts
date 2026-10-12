import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { calculateGirokontoTimeline, dayKeyOf } from './girokonto'
import { format, isSameDay } from 'date-fns'
import { calculateGirokontoTimeline as legacyTimeline } from './__reference__/girokonto.legacy'
import { Expense, FixedCost, IncomeSource } from '@/app/types'

// Die Girokonto-Simulation wurde auf Geschwindigkeit optimiert. RULES.md verlangt, dass
// alle Kennzahlen exakt der Tagesrechnung folgen — daher muss die neue Version für
// beliebige Daten bit-identische Ergebnisse zur bisherigen Version liefern.

function rng(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        return seed / 4294967296
    }
}

const FREQS = [undefined, 'monthly', 'daily', 'weekly', 'quarterly', 'yearly', 'bogus'] as const

function randomDate(r: () => number, spanDays: number): string {
    const base = new Date(2026, 9, 12, 12).getTime()
    const d = new Date(base - Math.floor(r() * spanDays) * 86400000 + Math.floor(r() * 86400000))
    const style = r()
    if (style < 0.4) return d.toISOString().slice(0, 10)
    if (style < 0.8) return d.toISOString()
    return d.toString()
}

function randomData(seed: number) {
    const r = rng(seed)
    const span = 30 + Math.floor(r() * 900)
    const expenses: Expense[] = Array.from({ length: Math.floor(r() * 300) }, (_, i) => ({
        id: i,
        created_at: randomDate(r, span),
        expense_date: r() < 0.1 ? '' : randomDate(r, span),
        description: 'x',
        amount: (r() < 0.2 ? String((r() * 200 - 20).toFixed(2)) : Math.round((r() * 200 - 20) * 100) / 100) as unknown as number,
        category: r() < 0.1 ? 'Konto: Sparen' : r() < 0.5 ? 'Essen' : undefined,
        account_id: r() < 0.1 ? 3 : null,
    }))
    const fixedCosts: FixedCost[] = Array.from({ length: Math.floor(r() * 12) }, (_, i) => ({
        id: i,
        title: 'f',
        amount: (r() < 0.3 ? String((r() * 500).toFixed(2)) : r() * 500) as unknown as number,
        valid_from: r() < 0.3 ? null : randomDate(r, span),
        valid_to: r() < 0.6 ? null : randomDate(r, span),
        frequency: FREQS[Math.floor(r() * FREQS.length)] as FixedCost['frequency'],
    }))
    const incomeSources: IncomeSource[] = Array.from({ length: Math.floor(r() * 6) }, (_, i) => ({
        id: i,
        title: 'i',
        amount: (r() < 0.3 ? String((r() * 3000).toFixed(2)) : r() * 3000) as unknown as number,
        valid_from: r() < 0.3 ? undefined : randomDate(r, span),
        valid_to: r() < 0.6 ? null : randomDate(r, span),
        frequency: FREQS[Math.floor(r() * FREQS.length)] as IncomeSource['frequency'],
    }))
    return { expenses, fixedCosts, incomeSources, initial: r() < 0.5 ? 0 : r() * 1000 - 500 }
}

type Run = () => ReturnType<typeof legacyTimeline>

// Vergleicht beide Versionen exakt (Object.is, also auch -0/NaN) — inklusive des Falls,
// dass beide mit demselben Fehler abbrechen (z. B. ungültiges Ausgabendatum).
function diff(newRun: Run, oldRun: Run): string | null {
    let a, b
    let errA: unknown = null, errB: unknown = null
    try { a = newRun() } catch (e) { errA = e }
    try { b = oldRun() } catch (e) { errB = e }
    if (errA || errB) return String(errA) === String(errB) ? null : `Fehler: ${errA} vs ${errB}`
    if (!a || !b) return 'kein Ergebnis'
    if (!Object.is(a.finalBalance, b.finalBalance)) return `finalBalance ${a.finalBalance} vs ${b.finalBalance}`
    if (a.timeline.length !== b.timeline.length) return `Länge ${a.timeline.length} vs ${b.timeline.length}`
    for (let i = 0; i < a.timeline.length; i++) {
        const t = a.timeline[i], u = b.timeline[i]
        if (t.date.getTime() !== u.date.getTime()) return `Datum an Index ${i}`
        for (const k of ['balance', 'tagesbudget', 'tagesergebnis', 'income_val', 'fixed_cost_val', 'expense_val'] as const) {
            if (!Object.is(t[k], u[k])) return `${k} an Index ${i}: ${t[k]} vs ${u[k]}`
        }
    }
    return null
}

describe('calculateGirokontoTimeline – identisch zur bisherigen Version', () => {
    beforeAll(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2026, 9, 12, 18, 30))
    })
    afterAll(() => {
        vi.useRealTimers()
    })

    it('liefert für 300 Zufallsdatensätze exakt dieselben Werte', { timeout: 60000 }, () => {
        for (let seed = 1; seed <= 300; seed++) {
            const { expenses, fixedCosts, incomeSources, initial } = randomData(seed)
            const d = diff(
                () => calculateGirokontoTimeline(expenses, incomeSources, fixedCosts, initial),
                () => legacyTimeline(expenses, incomeSources, fixedCosts, initial)
            )
            expect(d, `Seed ${seed}`).toBeNull()
        }
    })

    it('Randfälle: keine Daten, ungültiges Datum, nur Fixkosten', () => {
        const cases: [Expense[], IncomeSource[], FixedCost[]][] = [
            [[], [], []],
            [[], [{ id: 1, title: 'i', amount: 100 }], []],
            [[{ id: 1, created_at: 'kaputt', expense_date: '', description: '', amount: 5 }], [], []],
            [[], [], [{ id: 1, title: 'f', amount: 50, valid_from: '2026-01-01' }]],
            [[], [{ id: 1, title: 'i', amount: 100, valid_from: 'kein datum' }], []],
            [[], [], [{ id: 1, title: 'f', amount: 50, valid_from: '2025-03-30', valid_to: 'kaputt' }]],
        ]
        for (const [e, i, f] of cases) {
            expect(diff(() => calculateGirokontoTimeline(e, i, f), () => legacyTimeline(e, i, f))).toBeNull()
        }
    })
})

describe('dayKeyOf – Ersatz für format(d, "yyyy-MM-dd") / isSameDay', () => {
    it('entspricht date-fns für Zeitpunkte rund um Mitternacht, Zeitumstellung und Jahreswechsel', () => {
        const r = rng(42)
        const starts = [new Date(2026, 2, 28), new Date(2026, 9, 24), new Date(2025, 11, 30), new Date(2024, 1, 28)]
        for (const s of starts) {
            for (let h = 0; h < 24 * 4; h++) {
                for (const min of [0, 1, 59]) {
                    const d = new Date(s.getTime() + h * 3600000 + min * 60000)
                    expect(dayKeyOf(d)).toBe(format(d, 'yyyy-MM-dd'))
                }
            }
        }
        for (let i = 0; i < 20000; i++) {
            const a = new Date(Date.UTC(2020, 0, 1) + Math.floor(r() * 3000 * 86400000))
            const b = new Date(a.getTime() + Math.floor((r() - 0.5) * 3 * 86400000))
            expect(dayKeyOf(a)).toBe(format(a, 'yyyy-MM-dd'))
            expect(dayKeyOf(a) === dayKeyOf(b)).toBe(isSameDay(a, b))
        }
    })
})
