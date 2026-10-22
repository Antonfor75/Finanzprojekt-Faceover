'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import * as api from '@/utils/sharing/api'
import type { FriendState, SaveShareInput, SharedPurchase } from '@/utils/sharing/types'

/**
 * Geteilte Einkäufe (Freundschaft + Teilung). Jede Action ist eine dünne Hülle um die gleichnamige
 * Funktion in utils/sharing/api.ts, läuft als angemeldeter Nutzer (RLS) und reicht die deutsche
 * Fehlermeldung der Datenbank unverändert durch.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: (sb: Awaited<ReturnType<typeof createClient>>) => Promise<T>, revalidate = false): Promise<Result<T>> {
    try {
        const sb = await createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) return { ok: false, error: 'Nicht angemeldet.' }
        const data = await fn(sb)
        if (revalidate) revalidatePath('/')
        return { ok: true, data }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Unbekannter Fehler.' }
    }
}

export async function actGetFriendState(): Promise<Result<FriendState>> {
    return run<FriendState>((sb) => api.getFriendState(sb))
}
export async function actSetHandle(handle: string): Promise<Result<string>> {
    return run<string>((sb) => api.setHandle(sb, handle), true)
}
export async function actSendFriendRequest(handle: string): Promise<Result<FriendState>> {
    return run<FriendState>((sb) => api.sendFriendRequest(sb, handle), true)
}
export async function actCancelFriendRequest(): Promise<Result<FriendState>> {
    return run<FriendState>((sb) => api.cancelFriendRequest(sb), true)
}
export async function actRespondFriendRequest(id: string, accept: boolean): Promise<Result<FriendState>> {
    return run<FriendState>((sb) => api.respondFriendRequest(sb, id, accept), true)
}
export async function actEndFriendship(): Promise<Result<FriendState>> {
    return run<FriendState>((sb) => api.endFriendship(sb), true)
}

export async function actSaveShare(input: SaveShareInput): Promise<Result<string>> {
    return run<string>((sb) => api.saveShare(sb, input), true)
}
export async function actUnshare(id: string): Promise<Result<void>> {
    return run<void>((sb) => api.unshare(sb, id), true)
}
export async function actDeleteShared(id: string): Promise<Result<void>> {
    return run<void>((sb) => api.deleteShared(sb, id), true)
}
export async function actMarkSharesSeen(): Promise<Result<void>> {
    return run<void>((sb) => api.markSharesSeen(sb))
}
export async function actGetSharedPurchase(id: string): Promise<Result<SharedPurchase>> {
    return run<SharedPurchase>((sb) => api.getSharedPurchase(sb, id))
}
