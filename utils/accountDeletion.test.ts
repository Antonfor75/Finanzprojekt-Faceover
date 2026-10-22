import { describe, it, expect } from 'vitest'
import {
    wipeUserRows, endUserSharing, USER_TABLES, deletionRequestedAt, isDueForPurge, purgeAfter, DELETION_GRACE_DAYS, DELETION_FLAG,
    type WipeClient,
} from './accountDeletion'

describe('Löschfrist', () => {
    const requested = new Date('2026-10-01T12:00:00.000Z')

    it('liest den Zeitpunkt nur aus gültigem app_metadata', () => {
        expect(deletionRequestedAt({ app_metadata: { [DELETION_FLAG]: requested.toISOString() } })).toEqual(requested)
        expect(deletionRequestedAt({ app_metadata: {} })).toBeNull()
        expect(deletionRequestedAt({ app_metadata: { [DELETION_FLAG]: 'kein-datum' } })).toBeNull()
        expect(deletionRequestedAt({ app_metadata: { [DELETION_FLAG]: 123 } })).toBeNull()
        expect(deletionRequestedAt(null)).toBeNull()
    })

    it('die Frist beträgt mindestens 30 Tage', () => {
        expect(DELETION_GRACE_DAYS).toBeGreaterThanOrEqual(30)
        expect(purgeAfter(requested).toISOString()).toBe('2026-10-31T12:00:00.000Z')
    })

    it('löscht erst nach der vollen Frist endgültig', () => {
        expect(isDueForPurge(requested, new Date('2026-10-31T11:59:59.999Z'))).toBe(false)
        expect(isDueForPurge(requested, new Date('2026-10-31T12:00:00.000Z'))).toBe(true)
        expect(isDueForPurge(requested, new Date('2026-12-01T00:00:00.000Z'))).toBe(true)
    })

    it('ohne Löschanfrage wird nie etwas endgültig gelöscht', () => {
        expect(isDueForPurge(null, new Date('2030-01-01T00:00:00.000Z'))).toBe(false)
    })
})

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

describe('endUserSharing', () => {
    it('löscht Teilungen (als creator und als partner) vor den Freundschaften (als requester und addressee)', async () => {
        const { client, calls } = fakeClient()
        await endUserSharing(client, 'user-1')
        expect(calls).toEqual([
            { table: 'shared_purchases', column: 'creator_id', value: 'user-1' },
            { table: 'shared_purchases', column: 'partner_id', value: 'user-1' },
            { table: 'friendships', column: 'requester_id', value: 'user-1' },
            { table: 'friendships', column: 'addressee_id', value: 'user-1' },
        ])
    })

    it('fasst keine Ausgaben an (die Kopie des Freundes löst ON DELETE SET NULL)', async () => {
        const { client, calls } = fakeClient()
        await endUserSharing(client, 'user-1')
        expect(calls.map(c => c.table)).not.toContain('expenses')
    })

    it('überspringt fehlende Tabellen (42P01), bricht aber bei echtem Fehler ab', async () => {
        const missing = fakeClient({ table: 'shared_purchases', code: '42P01' })
        await endUserSharing(missing.client, 'user-1')
        expect(missing.calls).toHaveLength(4)

        const broken = fakeClient({ table: 'shared_purchases', code: '42501' })
        await expect(endUserSharing(broken.client, 'user-1')).rejects.toThrow('shared_purchases')
        expect(broken.calls.map(c => c.table)).not.toContain('friendships')
    })

    it('verweigert eine leere User-ID', async () => {
        const { client, calls } = fakeClient()
        await expect(endUserSharing(client, '')).rejects.toThrow()
        expect(calls).toHaveLength(0)
    })
})
