import { describe, it, expect } from 'vitest'
import { calculateGirokontoTimeline } from './girokonto'
import type { Expense, IncomeSource, FixedCost } from '@/app/types'

const day = (n: number) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
}
const ex = (id: number, amount: number, daysAgo: number, extra: Partial<Expense> = {}): Expense =>
    ({ id, created_at: day(daysAgo), description: 'x', amount, expense_date: day(daysAgo), category: 'Essen', ...extra })
const income: IncomeSource[] = []
const fixed: FixedCost[] = []

describe('calculateGirokontoTimeline mit Umbuchungen', () => {
    const expenses: Expense[] = [
        ex(1, 20, 3),                                                       // echte Ausgabe
        ex(2, 50, 2, { category: 'Umbuchung', transfer_id: 't1' }),         // Giro -> Spaßkonto
        ex(3, -30, 1, { category: 'Umbuchung', transfer_id: 't2' }),        // Spaßkonto -> Giro
        ex(4, 10, 1, { category: 'Manuelle Buchung' }),                     // Ausgleich
        ex(5, 99, 1, { category: 'Freizeit', account_id: 7 }),              // vom Konto bezahlt: wie bisher neutral
    ]

    it('Kontostand ist exakt wie bisher (Umbuchungen bewegen ihn)', () => {
        const { finalBalance } = calculateGirokontoTimeline(expenses, income, fixed, 100)
        expect(finalBalance).toBeCloseTo(100 - 20 - 50 + 30 - 10, 10)
    })

    it('expense_val enthält nur echte Ausgaben, transfer_val die Umbuchungen', () => {
        const { timeline } = calculateGirokontoTimeline(expenses, income, fixed, 100)
        const sum = (k: 'expense_val' | 'transfer_val') => timeline.reduce((s, t) => s + t[k], 0)
        expect(sum('expense_val')).toBeCloseTo(20, 10)
        expect(sum('transfer_val')).toBeCloseTo(50 - 30 + 10, 10)
        const last = timeline[timeline.length - 1]
        expect(last.balance).toBeCloseTo(50, 10) // 100 - 20 - 50 + 30 - 10
    })

    it('ohne Umbuchungen ist transfer_val überall 0', () => {
        const { timeline } = calculateGirokontoTimeline([ex(1, 5, 1)], income, fixed, 0)
        expect(timeline.every((t) => t.transfer_val === 0)).toBe(true)
    })
})

describe('calculateGirokontoTimeline bei geteilten Ausgaben', () => {
    it('Teilen einer Ausgabe in einer alten Woche ändert den Kontostand ab diesem Tag', () => {
        const run = (amount: number) => calculateGirokontoTimeline(
            [ex(1, 4.5, 28), ex(2, amount, 21), ex(3, 7, 5)], income, fixed, 200,
        )
        const voll = run(19.48)
        const geteilt = run(9.96)

        expect(geteilt.finalBalance - voll.finalBalance).toBeCloseTo(9.52, 10)

        expect(geteilt.timeline).toHaveLength(voll.timeline.length)
        const teilungstag = day(21)
        const key = (t: { date: Date }) => t.date.toISOString().slice(0, 10)
        voll.timeline.forEach((t, i) => {
            const g = geteilt.timeline[i]
            if (t.date.getTime() < new Date(teilungstag).getTime()) {
                expect(g.balance).toBeCloseTo(t.balance, 10)
            } else {
                expect(g.balance - t.balance).toBeCloseTo(9.52, 10)
            }
            expect(key(g)).toBe(key(t))
        })
    })
})
