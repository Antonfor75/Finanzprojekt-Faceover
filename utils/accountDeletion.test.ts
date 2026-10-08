import { describe, it, expect } from 'vitest'
import { wipeUserRows, USER_TABLES, type WipeClient } from './accountDeletion'

function fakeClient(failOn?: { table: string; code?: string }) {
    const calls: { table: string; column: string; value: string }[] = []
    const client: WipeClient = {
        from: (table) => ({
            delete: () => ({
                eq: async (column, value) => {
                    calls.push({ table, column, value })
                    if (failOn?.table === table) return { error: { code: failOn.code, message: 'boom' } }
                    return { error: null }
                },
            }),
        }),
    }
    return { client, calls }
}

describe('wipeUserRows', () => {
    it('löscht in jeder Nutzertabelle nur die Zeilen dieses Nutzers', async () => {
        const { client, calls } = fakeClient()
        await wipeUserRows(client, 'user-1')
        expect(calls.map(c => c.table)).toEqual([...USER_TABLES])
        expect(calls.every(c => c.column === 'user_id' && c.value === 'user-1')).toBe(true)
    })

    it('löscht Kindtabellen vor den Elterntabellen', () => {
        const idx = (t: string) => USER_TABLES.indexOf(t as (typeof USER_TABLES)[number])
        expect(idx('receipt_items')).toBeLessThan(idx('expenses'))
        expect(idx('fun_group_expenses')).toBeLessThan(idx('fun_groups'))
        expect(idx('fun_groups')).toBeLessThan(idx('fun_accounts_v2'))
        expect(idx('account_transactions')).toBeLessThan(idx('accounts'))
    })

    it('überspringt fehlende Tabellen (42P01)', async () => {
        const { client, calls } = fakeClient({ table: 'budget_logs', code: '42P01' })
        await wipeUserRows(client, 'user-1')
        expect(calls).toHaveLength(USER_TABLES.length)
    })

    it('bricht bei echtem Fehler ab, bevor weitere Tabellen angefasst werden', async () => {
        const { client, calls } = fakeClient({ table: 'products', code: '42501' })
        await expect(wipeUserRows(client, 'user-1')).rejects.toThrow('products')
        expect(calls.map(c => c.table)).not.toContain('expenses')
    })

    it('verweigert eine leere User-ID', async () => {
        const { client, calls } = fakeClient()
        await expect(wipeUserRows(client, '')).rejects.toThrow()
        expect(calls).toHaveLength(0)
    })
})
