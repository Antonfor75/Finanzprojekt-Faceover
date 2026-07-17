
import { describe, it, expect } from 'vitest';
import { classifyBucket, classifyGroupBucket, calculateFunAccountSaldo } from './funAccountGroups';

describe('Fun Account Groups Logic', () => {
    const now = new Date(2026, 6, 15) // 2026-07-15

    describe('classifyBucket', () => {
        it('classifies a date exactly today as aktuell', () => {
            expect(classifyBucket('2026-07-15', now)).toBe('aktuell')
        })

        it('classifies a future date as zukuenftig', () => {
            expect(classifyBucket('2026-08-01', now)).toBe('zukuenftig')
        })

        it('classifies a past date as vergangen', () => {
            expect(classifyBucket('2026-07-01', now)).toBe('vergangen')
        })
    })

    describe('classifyGroupBucket', () => {
        it('treats a group without end_date as a single-day event, not an open range', () => {
            expect(classifyGroupBucket({ start_date: '2026-07-01', end_date: null }, now)).toBe('vergangen')
        })

        it('classifies a range not yet started as zukuenftig', () => {
            expect(classifyGroupBucket({ start_date: '2026-08-01', end_date: '2026-08-10' }, now)).toBe('zukuenftig')
        })

        it('classifies a range already ended as vergangen', () => {
            expect(classifyGroupBucket({ start_date: '2026-06-01', end_date: '2026-06-10' }, now)).toBe('vergangen')
        })

        it('classifies a single-day group (no end_date) today as aktuell', () => {
            expect(classifyGroupBucket({ start_date: '2026-07-15', end_date: null }, now)).toBe('aktuell')
        })

        it('classifies a single-day group (no end_date) in the future as zukuenftig', () => {
            expect(classifyGroupBucket({ start_date: '2026-07-20', end_date: null }, now)).toBe('zukuenftig')
        })

        it('classifies a single-day group (no end_date) in the past as vergangen', () => {
            expect(classifyGroupBucket({ start_date: '2026-07-01', end_date: null }, now)).toBe('vergangen')
        })

        it('treats a range including today (start <= today <= end) as aktuell', () => {
            expect(classifyGroupBucket({ start_date: '2026-07-10', end_date: '2026-07-20' }, now)).toBe('aktuell')
        })
    })

    describe('calculateFunAccountSaldo', () => {
        it('counts only past/today income and past/today expenses when foresight is off', () => {
            const expenses = [
                { amount: 10, expense_date: '2026-07-10' }, // past
                { amount: 20, expense_date: '2026-07-20' }, // future
            ]
            const income = [
                { amount: 100, income_date: '2026-07-10' }, // past
                { amount: 50, income_date: '2026-07-20' }, // future
            ]
            expect(calculateFunAccountSaldo(expenses, income, false, now)).toBe(100 - 10)
        })

        it('deducts future expenses immediately when foresight is on, but still excludes future income', () => {
            const expenses = [
                { amount: 10, expense_date: '2026-07-10' }, // past
                { amount: 20, expense_date: '2026-07-20' }, // future
            ]
            const income = [
                { amount: 100, income_date: '2026-07-10' }, // past
                { amount: 50, income_date: '2026-07-20' }, // future
            ]
            expect(calculateFunAccountSaldo(expenses, income, true, now)).toBe(100 - (10 + 20))
        })

        it('counts income/expenses dated exactly today in both modes', () => {
            const expenses = [{ amount: 5, expense_date: '2026-07-15' }]
            const income = [{ amount: 5, income_date: '2026-07-15' }]
            expect(calculateFunAccountSaldo(expenses, income, false, now)).toBe(0)
            expect(calculateFunAccountSaldo(expenses, income, true, now)).toBe(0)
        })

        it('returns 0 for empty inputs', () => {
            expect(calculateFunAccountSaldo([], [], true, now)).toBe(0)
            expect(calculateFunAccountSaldo([], [], false, now)).toBe(0)
        })
    })
})
