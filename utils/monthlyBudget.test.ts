import { describe, it, expect } from 'vitest'
import { calculateMonthlyBudget } from './financeHelpers'

describe('calculateMonthlyBudget', () => {
    it('summiert Einnahmen (auch als numeric-Strings aus Postgres)', () => {
        expect(calculateMonthlyBudget([{ amount: '2400' }, { amount: 450 }], [])).toBe(2850)
    })

    it('rechnet Verteilkonten anteilig pro Restmonat dazu', () => {
        const accounts = [
            { type: 'distribution', amount: '600', months: 3 },
            { type: 'savings', amount: 1000, months: 0 },
            { type: 'distribution', amount: 300, months: 0 }, // abgelaufen
            { type: 'distribution', amount: 0, months: 2 },   // leer
        ]
        expect(calculateMonthlyBudget([{ amount: 2000 }], accounts)).toBe(2200)
    })

    it('ohne Daten ist das Budget 0', () => {
        expect(calculateMonthlyBudget([], [])).toBe(0)
    })
})
