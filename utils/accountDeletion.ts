// Alle Tabellen mit Nutzerdaten, Kinder vor Eltern (Fremdschlüssel). Muss zur
// Liste USER_TABLES in der chef-admin Edge Function passen.
export const USER_TABLES = [
    'pending_receipts',
    'receipt_items',
    'product_aliases',
    'products',
    'fun_group_expenses',
    'fun_income_entries',
    'fun_groups',
    'fun_accounts_v2',
    'account_transactions',
    'budget_logs',
    'expenses',
    'fixed_costs',
    'accounts',
    'settings',
    'income_sources',
] as const

/**
 * Konto löschen mit Frist: Das Konto wird sofort gesperrt, die Daten bleiben aber mindestens
 * DELETION_GRACE_DAYS Tage in der Datenbank (Wiederherstellung bei Versehen); erst danach löscht
 * der tägliche Lauf (app/api/purge-deleted-accounts) alles endgültig. Der Zeitpunkt der Löschung
 * steht in app_metadata.deletion_requested_at — nur die Service-Role kann ihn setzen.
 */
export const DELETION_GRACE_DAYS = 30
export const DELETION_FLAG = 'deletion_requested_at'
/** "Für immer" gesperrt (GoTrue kennt nur Dauern, kein Datum). */
export const BAN_FOREVER = '876000h'

const DAY_MS = 24 * 60 * 60 * 1000

/** Zeitpunkt der Löschanfrage aus app_metadata; null, wenn keine (gültige) gesetzt ist. */
export function deletionRequestedAt(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): Date | null {
    const raw = user?.app_metadata?.[DELETION_FLAG]
    if (typeof raw !== 'string') return null
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
}

/** Ab wann die Daten endgültig gelöscht werden dürfen: frühestens nach der vollen Frist. */
export function purgeAfter(requestedAt: Date): Date {
    return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS)
}

export function isDueForPurge(requestedAt: Date | null, now: Date = new Date()): boolean {
    return !!requestedAt && now.getTime() >= purgeAfter(requestedAt).getTime()
}

type DeleteResult ={ error: { code?: string; message: string } | null }

/** Minimale Form eines Supabase-Clients, damit die Logik ohne Netz testbar bleibt. */
export type WipeClient = {
    from: (table: string) => {
        delete: () => { eq: (column: string, value: string) => PromiseLike<DeleteResult> }
    }
}

/**
 * Löscht alle Zeilen eines Nutzers, Tabelle für Tabelle. Eine Tabelle, die es
 * (noch) nicht gibt (42P01), wird übersprungen; jeder andere Fehler bricht ab,
 * damit nie ein Auth-User ohne seine Daten — oder umgekehrt — übrig bleibt.
 */
export async function wipeUserRows(client: WipeClient, userId: string): Promise<void> {
    if (!userId) throw new Error('Keine User-ID.')
    for (const table of USER_TABLES) {
        const { error } = await client.from(table).delete().eq('user_id', userId)
        if (error && error.code !== '42P01') {
            throw new Error(`${table}: ${error.message}`)
        }
    }
}

/**
 * Beendet die Freundschaft und alle Teilungen eines Nutzers, bevor seine Ausgaben gelöscht werden (Zurücksetzen).
 * Sonst bliebe die Kopie des Freundes auf eine nicht mehr vorhandene Ausgabe verwiesen. Beim Löschen der
 * Teilungen werden die Verweise der Ausgaben und Artikel des Freundes über ON DELETE SET NULL gelöst; die
 * Kopie bleibt bei ihm als normale Ausgabe mit Hinweistext stehen. Die Spalten sind einzeln gefiltert (kein .or()).
 * Nicht vorhandene Tabellen (42P01) werden übersprungen, jeder andere Fehler bricht ab.
 */
export const SHARING_CLEANUP: ReadonlyArray<{ table: string; column: string }> = [
    { table: 'shared_purchases', column: 'creator_id' },
    { table: 'shared_purchases', column: 'partner_id' },
    { table: 'friendships', column: 'requester_id' },
    { table: 'friendships', column: 'addressee_id' },
]

export async function endUserSharing(client: WipeClient, userId: string): Promise<void> {
    if (!userId) throw new Error('Keine User-ID.')
    for (const { table, column } of SHARING_CLEANUP) {
        const { error } = await client.from(table).delete().eq(column, userId)
        if (error && error.code !== '42P01') {
            throw new Error(`${table}: ${error.message}`)
        }
    }
}
