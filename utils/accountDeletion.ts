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

type DeleteResult = { error: { code?: string; message: string } | null }

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
