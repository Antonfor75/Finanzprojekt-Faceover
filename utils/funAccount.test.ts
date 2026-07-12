
import { describe, it, expect } from 'vitest';
import { getMonthsToCredit, isBudgetRelevantExpense } from './funAccount';

describe('Fun Account Logic', () => {

    describe('getMonthsToCredit', () => {
        const now = new Date(2026, 6, 15) // 2026-07-15

        it('returns [] when the current month is already processed', () => {
            expect(getMonthsToCredit('2026-07', null, null, now)).toEqual([])
        })

        it('returns the current month when last processed month was the previous one', () => {
            expect(getMonthsToCredit('2026-06', null, null, now)).toEqual(['2026-07'])
        })

        it('catches up multiple missed months', () => {
            expect(getMonthsToCredit('2026-04', null, null, now)).toEqual(['2026-05', '2026-06', '2026-07'])
        })

        it('handles year boundaries', () => {
            expect(getMonthsToCredit('2025-11', null, null, new Date(2026, 0, 10)))
                .toEqual(['2025-12', '2026-01'])
        })

        it('returns only the current month when processedMonth is null (no back-shock)', () => {
            expect(getMonthsToCredit(null, null, null, now)).toEqual(['2026-07'])
        })

        it('returns [] when processedMonth is null and valid_from is in the future', () => {
            expect(getMonthsToCredit(null, '2026-09-01', null, now)).toEqual([])
        })

        it('skips months before valid_from', () => {
            expect(getMonthsToCredit('2026-03', '2026-06-01', null, now)).toEqual(['2026-06', '2026-07'])
        })

        it('skips months after valid_to', () => {
            expect(getMonthsToCredit('2026-04', null, '2026-05-31', now)).toEqual(['2026-05'])
        })

        it('never credits future months', () => {
            expect(getMonthsToCredit('2026-07', null, null, now)).toEqual([])
            expect(getMonthsToCredit('2026-08', null, null, now)).toEqual([])
        })
    })

    describe('isBudgetRelevantExpense', () => {
        it('treats normal expenses as budget-relevant', () => {
            expect(isBudgetRelevantExpense({ category: 'Essen', account_id: null })).toBe(true)
        })

        it('excludes expenses paid from an account (account_id set)', () => {
            expect(isBudgetRelevantExpense({ category: 'Freizeit', account_id: 3 })).toBe(false)
        })

        it('excludes legacy account expenses via Konto: prefix', () => {
            expect(isBudgetRelevantExpense({ category: 'Konto: Urlaub', account_id: null })).toBe(false)
        })

        it('treats expenses without category as budget-relevant', () => {
            expect(isBudgetRelevantExpense({ account_id: null })).toBe(true)
        })
    })
})
