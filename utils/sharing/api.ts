import type { SupabaseClient } from '@supabase/supabase-js'
import type { FriendState, SaveShareInput, SharedPurchase } from './types'

/**
 * Dünne Hülle um die RPCs aus drizzle/0012 und 0013. Fehler der Datenbank kommen als deutsche
 * Meldung (`error.message`) und werden unverändert als `Error` geworfen.
 */

async function call<T>(sb: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(name, args)
    if (error) throw new Error(error.message)
    return data as T
}

// ---------- Freundschaft ----------

export const getFriendState = (sb: SupabaseClient) => call<FriendState>(sb, 'get_friend_state')
export const setHandle = (sb: SupabaseClient, handle: string) => call<string>(sb, 'set_my_handle', { p_handle: handle })
export const sendFriendRequest = (sb: SupabaseClient, handle: string) => call<FriendState>(sb, 'send_friend_request', { p_handle: handle })
export const cancelFriendRequest = (sb: SupabaseClient) => call<FriendState>(sb, 'cancel_friend_request')
export const respondFriendRequest = (sb: SupabaseClient, id: string, accept: boolean) =>
    call<FriendState>(sb, 'respond_friend_request', { p_request_id: id, p_accept: accept })
export const endFriendship = (sb: SupabaseClient) => call<FriendState>(sb, 'end_friendship')

// ---------- Teilung ----------

/** Legt die Teilung an oder ändert sie; gibt die ID der Teilung zurück. */
export const saveShare = (sb: SupabaseClient, input: SaveShareInput) =>
    call<string>(sb, 'save_share', {
        p_expense_id: input.expenseId,
        p_mode: input.mode,
        p_partner_percent: input.partnerPercent ?? null,
        p_partner_amount: input.partnerAmount ?? null,
        p_items: input.items ?? [],
    })

export const unshare = async (sb: SupabaseClient, id: string): Promise<void> => { await call<void>(sb, 'unshare', { p_id: id }) }
export const deleteShared = async (sb: SupabaseClient, id: string): Promise<void> => { await call<void>(sb, 'delete_shared', { p_id: id }) }
export const markSharesSeen = async (sb: SupabaseClient): Promise<void> => { await call<void>(sb, 'mark_shares_seen') }

/** Liest eine Teilung (RLS: nur die eigenen). */
export async function getSharedPurchase(sb: SupabaseClient, id: string): Promise<SharedPurchase> {
    const { data, error } = await sb.from('shared_purchases').select('*').eq('id', id).single()
    if (error) throw new Error(error.message)
    return data as SharedPurchase
}
