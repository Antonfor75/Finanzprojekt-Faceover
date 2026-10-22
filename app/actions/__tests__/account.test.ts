import { describe, it, expect, vi, beforeEach } from 'vitest'

// Nachgebaut: angemeldeter Nutzer (Cookie-Client) und Service-Role, die jeden Aufruf mitschreibt.
const state = vi.hoisted(() => ({
    user: null as null | { id: string; email: string },
    updates: [] as { id: string; attrs: Record<string, unknown> }[],
    deletedTables: [] as string[],
    deletedUsers: [] as string[],
    signOuts: [] as unknown[],
    users: [] as { id: string; app_metadata: Record<string, unknown> }[],
    purged: [] as string[],
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => ({ data: { user: state.user }, error: null }),
            signOut: async (opts: unknown) => { state.signOuts.push(opts); return { error: null } },
        },
    }),
}))

vi.mock('@/utils/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            admin: {
                updateUserById: async (id: string, attrs: Record<string, unknown>) => { state.updates.push({ id, attrs }); return { error: null } },
                deleteUser: async (id: string) => { state.deletedUsers.push(id); return { error: null } },
                listUsers: async () => ({ data: { users: state.users }, error: null }),
            },
        },
        from: (table: string) => ({
            delete: () => {
                state.deletedTables.push(table)
                const result = { error: null }
                return { eq: async () => result }
            },
        }),
    },
}))

vi.mock('@/lib/receiptScanStorage', () => ({ removeAllReceiptImages: async () => undefined }))
vi.mock('@/lib/accountPurge', () => ({ purgeAccount: async (id: string) => { state.purged.push(id) } }))

import { deleteOwnAccount } from '../account'
import { GET as purgeRoute } from '@/app/api/purge-deleted-accounts/route'
import { DELETION_FLAG, DELETION_GRACE_DAYS } from '@/utils/accountDeletion'

beforeEach(() => {
    state.user = { id: 'u1', email: 'anna@example.com' }
    state.updates = []
    state.deletedTables = []
    state.deletedUsers = []
    state.signOuts = []
    state.users = []
    state.purged = []
})

describe('deleteOwnAccount (mit Frist)', () => {
    it('sperrt das Konto und merkt den Zeitpunkt, löscht aber keine Daten und nicht den Auth-Nutzer', async () => {
        const res = await deleteOwnAccount('Anna@Example.com')
        expect(res).toEqual({ success: true })

        expect(state.updates).toHaveLength(1)
        expect(state.updates[0].id).toBe('u1')
        expect(state.updates[0].attrs.ban_duration).toBeTruthy()
        const flag = (state.updates[0].attrs.app_metadata as Record<string, string>)[DELETION_FLAG]
        expect(Math.abs(Date.now() - new Date(flag).getTime())).toBeLessThan(5_000)

        expect(state.deletedUsers).toEqual([])
        // Nur Arbeitsdaten gehen sofort weg — nie die eigentlichen Nutzerdaten.
        expect([...new Set(state.deletedTables)].sort()).toEqual(['friendships', 'pending_receipts', 'shared_purchases'])
        expect(state.signOuts).toEqual([{ scope: 'global' }])
    })

    it('verlangt die richtige E-Mail und ändert sonst nichts', async () => {
        const res = await deleteOwnAccount('jemand@anderes.de')
        expect(res.success).toBe(false)
        expect(state.updates).toEqual([])
        expect(state.deletedTables).toEqual([])
    })

    it('verlangt eine Anmeldung', async () => {
        state.user = null
        expect((await deleteOwnAccount('x@y.de')).success).toBe(false)
        expect(state.updates).toEqual([])
    })
})

describe('Lauf zum endgültigen Löschen', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const call = (auth?: string) => purgeRoute({ headers: new Headers(auth ? { authorization: auth } : {}) } as never)

    beforeEach(() => { process.env.CRON_SECRET = 'geheim' })

    it('ist ohne passendes Geheimnis gesperrt', async () => {
        state.users = [{ id: 'a', app_metadata: { [DELETION_FLAG]: daysAgo(100) } }]
        expect((await call()).status).toBe(401)
        expect((await call('Bearer falsch')).status).toBe(401)
        delete process.env.CRON_SECRET
        expect((await call('Bearer undefined')).status).toBe(401)
        expect(state.purged).toEqual([])
    })

    it('löscht nur Konten nach abgelaufener Frist', async () => {
        state.users = [
            { id: 'alt', app_metadata: { [DELETION_FLAG]: daysAgo(DELETION_GRACE_DAYS + 1) } },
            { id: 'frisch', app_metadata: { [DELETION_FLAG]: daysAgo(DELETION_GRACE_DAYS - 1) } },
            { id: 'normal', app_metadata: {} },
        ]
        const res = await call('Bearer geheim')
        expect(await res.json()).toEqual({ purged: 1, waiting: 1, failed: 0 })
        expect(state.purged).toEqual(['alt'])
    })
})
