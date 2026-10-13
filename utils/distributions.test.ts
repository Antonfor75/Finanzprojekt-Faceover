import { describe, it, expect, vi, afterEach } from 'vitest'
import { processMonthlyDistributions } from './distributions'

type Row = Record<string, unknown>

// Minimaler Supabase-Nachbau: select('*'), .single(), update().eq('id', x) — protokolliert Updates.
function fakeClient(tables: { accounts: Row[]; settings: Row | null }) {
    const updates: { table: string; values: Row; id: unknown }[] = []
    const from = (table: string) => ({
        select: () => {
            const data = table === 'accounts' ? tables.accounts : tables.settings
            const result = Promise.resolve({ data, error: null })
            return Object.assign(result, { single: () => Promise.resolve({ data, error: null }) })
        },
        update: (values: Row) => ({
            eq: (_col: string, id: unknown) => {
                updates.push({ table, values, id })
                return Promise.resolve({ error: null })
            },
        }),
    })
    return { client: { from } as unknown as Parameters<typeof processMonthlyDistributions>[0], updates }
}

afterEach(() => vi.useRealTimers())

describe('processMonthlyDistributions', () => {
    it('zahlt einen Monatsanteil aus und erhöht das Monatsbudget', async () => {
        vi.useFakeTimers({ now: new Date('2026-10-13T10:00:00Z') })
        const { client, updates } = fakeClient({
            accounts: [
                { id: 1, type: 'distribution', amount: 1200, months: 12, processed_month: '2026-09', valid_from: null },
                { id: 2, type: 'savings', amount: 500, months: 5, processed_month: null, valid_from: null },
            ],
            settings: { id: 7, monthly_budget: 1000 },
        })
        expect(await processMonthlyDistributions(client)).toBe(true)
        expect(updates).toEqual([
            { table: 'accounts', id: 1, values: { amount: 1100, months: 11, processed_month: '2026-10' } },
            { table: 'settings', id: 7, values: { monthly_budget: 1100 } },
        ])
    })

    it('tut nichts, wenn schon verarbeitet, noch nicht gültig oder leer', async () => {
        vi.useFakeTimers({ now: new Date('2026-10-13T10:00:00Z') })
        const { client, updates } = fakeClient({
            accounts: [
                { id: 1, type: 'distribution', amount: 1200, months: 12, processed_month: '2026-10', valid_from: null },
                { id: 2, type: 'distribution', amount: 600, months: 6, processed_month: null, valid_from: '2026-12-01T00:00:00Z' },
                { id: 3, type: 'distribution', amount: 0, months: 3, processed_month: null, valid_from: null },
                { id: 4, type: 'distribution', amount: 300, months: 0, processed_month: null, valid_from: null },
            ],
            settings: { id: 7, monthly_budget: 1000 },
        })
        expect(await processMonthlyDistributions(client)).toBe(false)
        expect(updates).toEqual([])
    })

    it('bricht ohne Einstellungen ab', async () => {
        const { client, updates } = fakeClient({
            accounts: [{ id: 1, type: 'distribution', amount: 1200, months: 12, processed_month: null, valid_from: null }],
            settings: null,
        })
        expect(await processMonthlyDistributions(client)).toBe(false)
        expect(updates).toEqual([])
    })
})
