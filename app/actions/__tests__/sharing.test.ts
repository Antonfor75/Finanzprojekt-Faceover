import { describe, it, expect, vi, beforeEach } from 'vitest'

// Nachgebaut: angemeldeter Nutzer (Cookie-Client) mit dem Aufrufzähler der Datenbank-Funktionen (rpc).
const state = vi.hoisted(() => ({
    user: null as null | { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
    rpcCalls: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: state.user } }) },
        rpc: async (name: string) => {
            state.rpcCalls.push(name)
            return { data: { handle: null, friend: null, outgoing: null, incoming: [], unseenShares: 0 }, error: null }
        },
    }),
}))

import { actGetFriendState, actSendFriendRequest, actSetHandle } from '../sharing'

beforeEach(() => {
    state.user = null
    state.rpcCalls = []
})

describe('Freunde nur mit Kassenbon-Scan', () => {
    it('ohne Anmeldung nichts', async () => {
        expect(await actGetFriendState()).toEqual({ ok: false, error: 'Nicht angemeldet.' })
        expect(state.rpcCalls).toHaveLength(0)
    })

    it('ohne Merker wird nichts an die Datenbank weitergegeben', async () => {
        state.user = { id: 'u1', app_metadata: {} }
        for (const res of [await actGetFriendState(), await actSetHandle('lena'), await actSendFriendRequest('anna')]) {
            expect(res).toEqual({ ok: false, error: 'Freunde sind für dein Konto nicht freigeschaltet.' })
        }
        expect(state.rpcCalls).toHaveLength(0)
    })

    it('ein Merker in user_metadata zählt nicht', async () => {
        state.user = { id: 'u1', app_metadata: {}, user_metadata: { receipt_scan: true } }
        expect((await actGetFriendState()).ok).toBe(false)
        expect(state.rpcCalls).toHaveLength(0)
    })

    it('mit Merker läuft der Aufruf durch', async () => {
        state.user = { id: 'u1', app_metadata: { receipt_scan: true } }
        expect((await actGetFriendState()).ok).toBe(true)
        expect(state.rpcCalls).toEqual(['get_friend_state'])
    })
})
