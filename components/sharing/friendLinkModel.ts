import type { FriendState } from '@/utils/sharing/types'

/**
 * Reine Entscheidungen für Verknüpfen, Brief und Hinweis-Banner (geteilte Einkäufe).
 * Die Komponenten in components/sharing/ zeigen nur an, was hier entschieden wird.
 */

export type LinkKind = 'none' | 'pending' | 'connected'
export type LinkAction = 'connect' | 'cancel' | 'end'

export type LinkDescription = {
    kind: LinkKind
    status: string
    action: LinkAction
    actionLabel: string
    /** Name der Gegenseite (ausgehende Anfrage oder Freund), sonst null. */
    partnerHandle: string | null
}

export function describeLink(state: FriendState): LinkDescription {
    if (state.friend) {
        return { kind: 'connected', status: `Verbunden mit ${state.friend.handle}`, action: 'end', actionLabel: 'Verbindung trennen', partnerHandle: state.friend.handle }
    }
    if (state.outgoing) {
        return { kind: 'pending', status: `Anfrage gesendet · wartet auf ${state.outgoing.handle}`, action: 'cancel', actionLabel: 'Anfrage zurückziehen', partnerHandle: state.outgoing.handle }
    }
    return { kind: 'none', status: 'Noch nicht verbunden', action: 'connect', actionLabel: 'Verbinden', partnerHandle: null }
}

const HANDLE_PATTERN = /^[a-z0-9._]{3,20}$/

/** Eingabe wie auf dem Server: getrimmt, klein geschrieben; ein führendes @ wird verziehen. */
export function normalizeHandleInput(input: string): string {
    return input.trim().replace(/^@/, '').toLowerCase()
}

export function canSendRequest(input: string): boolean {
    return HANDLE_PATTERN.test(normalizeHandleInput(input))
}

/**
 * Die Anfrage, deren Brief gezeigt wird (die älteste offene, die nicht auf später gestellt wurde), sonst null.
 * Zurückgestellte Anfragen werden einzeln übersprungen, damit weitere Anfragen trotzdem ankommen.
 */
export function letterFor(state: FriendState, dismissedIds: readonly string[] = []): FriendState['incoming'][number] | null {
    // Mit bestehender Freundschaft gäbe es nur eine Fehlermeldung beim Annehmen.
    if (state.friend) return null
    return state.incoming.find((r) => !dismissedIds.includes(r.id)) ?? null
}

/** Offene Anfragen, deren Brief auf später gestellt wurde (für den Hinweis auf der Startseite). */
export function postponedLetters(state: FriendState, dismissedIds: readonly string[]): FriendState['incoming'] {
    if (state.friend) return []
    return state.incoming.filter((r) => dismissedIds.includes(r.id))
}

/** Hinweis auf der Startseite zu zurückgestellten Briefen; null, wenn keiner wartet. */
export function letterHint(state: FriendState, dismissedIds: readonly string[]): { count: number; text: string } | null {
    const waiting = postponedLetters(state, dismissedIds)
    if (waiting.length === 0) return null
    const text = waiting.length === 1
        ? `Freundschaftsanfrage von @${waiting[0].handle} wartet`
        : `${waiting.length} Freundschaftsanfragen warten`
    return { count: waiting.length, text }
}

export function bannerText(friendHandle: string, count: number): string {
    return `${friendHandle} hat ${count} ${count === 1 ? 'geteilte Ausgabe' : 'geteilte Ausgaben'} eingetragen oder geändert`
}

export function bannerFor(state: FriendState): { count: number; friendHandle: string } | null {
    if (!state.friend || state.unseenShares <= 0) return null
    return { count: state.unseenShares, friendHandle: state.friend.handle }
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const OFFLINE_ERROR = 'Keine Verbindung. Bitte versuche es später noch einmal.'

/** Server Actions werfen bei fehlendem Netz; hier wird daraus ein normales Fehlerergebnis. */
export async function settle<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    try {
        return await call
    } catch {
        return { ok: false, error: OFFLINE_ERROR }
    }
}
