import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readCachedData, writeCachedData, clearCachedData, type DashboardData } from './dashboardData'

function memoryStorage() {
    const store = new Map<string, string>()
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
    }
}

const sample: DashboardData = {
    expenses: [{ id: 1, created_at: '2026-10-01T10:00:00Z', description: 'Brot', amount: 2.5, expense_date: '2026-10-01', category: 'Lebensmittel' }],
    monthlyBudget: 1500,
    fixedCosts: [],
    settings: { id: 1, monthly_budget: 0, savings_balance: 0, savings_months_remaining: 0, last_processed_month: null } as DashboardData['settings'],
    accounts: [],
    incomeSources: [],
    receiptItems: [{ id: 9 } as NonNullable<DashboardData['receiptItems']>[number]],
    products: [],
    funSummary: { accountId: 3, saldo: 12.5, currentGroup: null },
}

describe('Zwischenspeicher der Dashboard-Daten', () => {
    beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
    afterEach(() => vi.unstubAllGlobals())

    it('liefert die Daten nur demselben Nutzer zurück', () => {
        writeCachedData('user-a', sample)
        expect(readCachedData('user-b')).toBeNull()
        const cached = readCachedData('user-a')
        expect(cached?.expenses).toEqual(sample.expenses)
        expect(cached?.funSummary).toEqual(sample.funSummary)
        expect(cached?.monthlyBudget).toBe(1500)
    })

    it('speichert Bon-Artikel nicht mit (die werden bei Bedarf geladen)', () => {
        writeCachedData('user-a', sample)
        const cached = readCachedData('user-a')
        expect(cached?.receiptItems).toBeUndefined()
        expect(cached?.products).toBeUndefined()
    })

    it('ist nach dem Abmelden leer', () => {
        writeCachedData('user-a', sample)
        clearCachedData()
        expect(readCachedData('user-a')).toBeNull()
    })

    it('übersteht fehlenden oder kaputten Speicher', () => {
        localStorage.setItem('cashflow:last-data:v1', '{kaputt')
        expect(readCachedData('user-a')).toBeNull()
        vi.stubGlobal('localStorage', undefined)
        expect(() => writeCachedData('user-a', sample)).not.toThrow()
        expect(readCachedData('user-a')).toBeNull()
        expect(() => clearCachedData()).not.toThrow()
    })
})
