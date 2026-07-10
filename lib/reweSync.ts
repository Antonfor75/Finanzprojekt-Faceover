import { supabaseAdmin } from '@/utils/supabase/admin'
import { decryptSecret } from '@/utils/crypto'
import { fetchReweMessages } from '@/utils/mailbox'
import { parseReweEmail } from '@/utils/parseReweEmail'

/**
 * Sync-Kern für den automatischen REWE-Import.
 *
 * Läuft als Hintergrundjob (aufgerufen aus /api/rewe-sync) und nutzt daher den
 * `supabaseAdmin`-Client (Service-Role, umgeht RLS). Weil `auth.uid()` dort NULL
 * ist, wird `user_id` bei jedem Insert explizit gesetzt — analog zu
 * app/actions/savings.ts und scripts/import_expenses_melina.ts.
 */

// Kategorie für REWE-Ausgaben — konsistent mit den Essen-Ausgaben der App.
const REWE_CATEGORY = 'Essen'
const REWE_DESCRIPTION = 'REWE Einkauf'

export type SyncResult = {
    imported: number
    skipped: number
    failed: number
    error?: string
}

/**
 * Importiert neue REWE-Bons für einen einzelnen User in dessen Ausgaben.
 */
export async function syncReweExpenses(userId: string): Promise<SyncResult> {
    const result: SyncResult = { imported: 0, skipped: 0, failed: 0 }

    // 1. Verbundenes Postfach laden.
    const { data: connection, error: connError } = await supabaseAdmin
        .from('email_connections')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

    if (connError) return { ...result, error: `Verbindung konnte nicht geladen werden: ${connError.message}` }
    if (!connection) return { ...result, error: 'Kein verbundenes Postfach für diesen User.' }

    // 2. Zugangsdaten entschlüsseln.
    let password: string
    try {
        password = decryptSecret(connection.secret_encrypted)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await markConnectionError(userId, `Entschlüsselung fehlgeschlagen: ${msg}`)
        return { ...result, error: 'Zugangsdaten konnten nicht entschlüsselt werden.' }
    }

    // 3. Zeitfenster bestimmen:
    //    - nach dem ersten Lauf: ab letztem Sync.
    //    - beim ersten Lauf: ab dem beim Verbinden gewählten Startdatum (import_since).
    //    - import_since = NULL → kein Filter, d. h. alle Bons im Postfach.
    const since = connection.last_sync_at
        ? new Date(connection.last_sync_at)
        : connection.import_since
            ? new Date(connection.import_since)
            : undefined

    // 4. Mails abrufen.
    let messages
    try {
        messages = await fetchReweMessages({ email: connection.email_address, password }, since)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await markConnectionError(userId, `IMAP-Abruf fehlgeschlagen: ${msg}`)
        return { ...result, error: `IMAP-Abruf fehlgeschlagen: ${msg}` }
    }

    // 5. Bereits importierte Message-IDs laden (schneller Vorabfilter; UNIQUE ist der Backstop).
    const { data: existing } = await supabaseAdmin
        .from('rewe_receipts')
        .select('message_id')
        .eq('user_id', userId)
    const known = new Set((existing || []).map((r) => r.message_id))

    // 6. Jede neue Mail verarbeiten.
    for (const msg of messages) {
        if (known.has(msg.messageId)) {
            result.skipped++
            continue
        }

        let parsed
        try {
            parsed = await parseReweEmail(msg)
        } catch (err) {
            console.error('[reweSync] Parsing-Fehler:', err)
            result.failed++
            continue
        }

        if (!parsed) {
            // Kein Gesamtbetrag erkennbar → keine REWE-Bon-Mail oder unbekanntes Format.
            result.skipped++
            continue
        }

        // 6a. Receipt-Zeile ZUERST anlegen — die UNIQUE(message_id) wirkt als Sperre
        //     gegen doppelte Ausgaben (auch bei parallelen Läufen).
        const { data: receipt, error: receiptError } = await supabaseAdmin
            .from('rewe_receipts')
            .insert({
                user_id: userId,
                message_id: msg.messageId,
                receipt_date: parsed.receiptDate,
                total_amount: parsed.totalAmount,
                raw_subject: msg.subject,
            })
            .select('id')
            .single()

        if (receiptError) {
            // 23505 = unique_violation → parallel bereits importiert, kein Fehler.
            if (receiptError.code === '23505') {
                result.skipped++
            } else {
                console.error('[reweSync] Receipt-Insert-Fehler:', receiptError)
                result.failed++
            }
            continue
        }

        // 6b. Ausgabe anlegen (gleiche Insert-Form wie bulkImportAll / import_expenses_melina).
        const { data: expense, error: expenseError } = await supabaseAdmin
            .from('expenses')
            .insert({
                description: REWE_DESCRIPTION,
                amount: parsed.totalAmount,
                expense_date: parsed.receiptDate,
                category: REWE_CATEGORY,
                user_id: userId,
            })
            .select('id')
            .single()

        if (expenseError || !expense) {
            // Ausgabe fehlgeschlagen → Receipt wieder entfernen, damit ein Retry möglich bleibt.
            console.error('[reweSync] Expense-Insert-Fehler:', expenseError)
            await supabaseAdmin.from('rewe_receipts').delete().eq('id', receipt.id)
            result.failed++
            continue
        }

        // 6c. Receipt mit der erzeugten Ausgabe verknüpfen (Audit).
        await supabaseAdmin
            .from('rewe_receipts')
            .update({ expense_id: expense.id })
            .eq('id', receipt.id)

        known.add(msg.messageId)
        result.imported++
    }

    // 7. Verbindungsstatus aktualisieren.
    await supabaseAdmin
        .from('email_connections')
        .update({ last_sync_at: new Date().toISOString(), status: 'connected', last_error: null })
        .eq('user_id', userId)

    return result
}

/**
 * Synchronisiert alle verbundenen Postfächer (für den Cron/API-Aufruf).
 */
export async function syncAllConnections(): Promise<Record<string, SyncResult>> {
    const summary: Record<string, SyncResult> = {}

    const { data: connections, error } = await supabaseAdmin
        .from('email_connections')
        .select('user_id')
        .eq('status', 'connected')

    if (error) throw new Error(`Verbindungen konnten nicht geladen werden: ${error.message}`)

    for (const conn of connections || []) {
        summary[conn.user_id] = await syncReweExpenses(conn.user_id)
    }

    return summary
}

async function markConnectionError(userId: string, message: string): Promise<void> {
    await supabaseAdmin
        .from('email_connections')
        .update({ status: 'error', last_error: message })
        .eq('user_id', userId)
}
