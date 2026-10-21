import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    getFriendState, setHandle, sendFriendRequest, cancelFriendRequest, respondFriendRequest, endFriendship,
    saveShare, unshare, deleteShared, markSharesSeen, getSharedPurchase,
} from './api'
import type { FriendState, ShareItem, SharedPurchase } from './types'

type Reply = { data?: unknown; error?: { message: string } | null }

/** Fake-Client: zeichnet rpc-Aufrufe und Tabellenabfragen auf und liefert eine feste Antwort. */
function fake(reply: Reply = { data: null, error: null }) {
    const calls: { name: string; args: unknown }[] = []
    const queries: unknown[][] = []
    const sb = {
        rpc: async (name: string, args?: unknown) => { calls.push({ name, args }); return { data: reply.data ?? null, error: reply.error ?? null } },
        from: (table: string) => {
            const chain = {
                select: (cols: string) => { queries.push(['select', table, cols]); return chain },
                eq: (col: string, val: unknown) => { queries.push(['eq', col, val]); return chain },
                single: async () => ({ data: reply.data ?? null, error: reply.error ?? null }),
            }
            return chain
        },
    } as unknown as SupabaseClient
    return { sb, calls, queries }
}

const state: FriendState = { handle: 'anton', friend: null, outgoing: null, incoming: [], unseenShares: 0 }
const items: ShareItem[] = [{ key: '1', name_raw: 'Milch', quantity: 1, unit: 'stk', unit_price: 1, total_price: 1, owner: 'partner' }]

describe('API-Hülle: Freundschaft', () => {
    it('getFriendState ruft get_friend_state auf', async () => {
        const { sb, calls } = fake({ data: state })
        expect(await getFriendState(sb)).toEqual(state)
        expect(calls).toEqual([{ name: 'get_friend_state', args: undefined }])
    })
    it('setHandle gibt den gespeicherten Namen zurück', async () => {
        const { sb, calls } = fake({ data: 'lena' })
        expect(await setHandle(sb, ' Lena ')).toBe('lena')
        expect(calls).toEqual([{ name: 'set_my_handle', args: { p_handle: ' Lena ' } }])
    })
    it('sendFriendRequest, respond, cancel und end rufen ihre RPCs mit den richtigen Parametern auf', async () => {
        const { sb, calls } = fake({ data: state })
        await sendFriendRequest(sb, 'lena')
        await cancelFriendRequest(sb)
        await respondFriendRequest(sb, 'req-1', true)
        await endFriendship(sb)
        expect(calls).toEqual([
            { name: 'send_friend_request', args: { p_handle: 'lena' } },
            { name: 'cancel_friend_request', args: undefined },
            { name: 'respond_friend_request', args: { p_request_id: 'req-1', p_accept: true } },
            { name: 'end_friendship', args: undefined },
        ])
    })
})

describe('API-Hülle: Teilung', () => {
    it('saveShare ruft save_share mit allen Parametern auf', async () => {
        const { sb, calls } = fake({ data: 'sp-1' })
        expect(await saveShare(sb, { expenseId: 7, mode: 'items', items })).toBe('sp-1')
        expect(calls).toEqual([{ name: 'save_share', args: { p_expense_id: 7, p_mode: 'items', p_partner_percent: null, p_partner_amount: null, p_items: items } }])
    })
    it('saveShare reicht Prozent bzw. Betrag durch und sendet eine leere Artikelliste', async () => {
        const { sb, calls } = fake({ data: 'sp-1' })
        await saveShare(sb, { expenseId: 7, mode: 'percent', partnerPercent: 40 })
        await saveShare(sb, { expenseId: 7, mode: 'amount', partnerAmount: 5.5 })
        expect(calls[0].args).toEqual({ p_expense_id: 7, p_mode: 'percent', p_partner_percent: 40, p_partner_amount: null, p_items: [] })
        expect(calls[1].args).toEqual({ p_expense_id: 7, p_mode: 'amount', p_partner_percent: null, p_partner_amount: 5.5, p_items: [] })
    })
    it('unshare, deleteShared und markSharesSeen rufen ihre RPCs auf', async () => {
        const { sb, calls } = fake()
        await unshare(sb, 'sp-1')
        await deleteShared(sb, 'sp-1')
        await markSharesSeen(sb)
        expect(calls).toEqual([
            { name: 'unshare', args: { p_id: 'sp-1' } },
            { name: 'delete_shared', args: { p_id: 'sp-1' } },
            { name: 'mark_shares_seen', args: undefined },
        ])
    })
    it('getSharedPurchase liest die Teilung per select auf shared_purchases', async () => {
        const row = { id: 'sp-1' } as SharedPurchase
        const { sb, queries } = fake({ data: row })
        expect(await getSharedPurchase(sb, 'sp-1')).toBe(row)
        expect(queries).toEqual([['select', 'shared_purchases', '*'], ['eq', 'id', 'sp-1']])
    })
})

describe('API-Hülle: Fehler', () => {
    it('macht aus einem RPC-Fehler einen Error mit der deutschen Meldung', async () => {
        const { sb } = fake({ error: { message: 'Das bist du selbst.' } })
        await expect(sendFriendRequest(sb, 'anton')).rejects.toThrow(new Error('Das bist du selbst.'))
        await expect(saveShare(sb, { expenseId: 1, mode: 'percent', partnerPercent: 50 })).rejects.toThrow('Das bist du selbst.')
        await expect(unshare(sb, 'x')).rejects.toThrow('Das bist du selbst.')
        await expect(getSharedPurchase(sb, 'x')).rejects.toThrow('Das bist du selbst.')
    })
})
