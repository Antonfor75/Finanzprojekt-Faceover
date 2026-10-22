/**
 * Backup wiederherstellen: Ausgaben für das Wiedereinfügen vorbereiten (rein, ohne Oberfläche, damit testbar).
 *
 * Ein Backup kann geteilte Ausgaben enthalten (shared_purchase_id + share_*). Die Teilung selbst liegt in
 * `shared_purchases` und wird nicht mitgesichert: eine alte shared_purchase_id verletzt beim Einfügen den
 * Fremdschlüssel und würde das gesamte Einfügen ablehnen. Darum werden die Teilungs-Verweise gelöst
 * (shared_purchase_id, share_total, share_mode = null); der Hinweistext `share_note` bleibt als Erinnerung stehen.
 */

export type BackupExpense = Record<string, unknown>

/** Spalten, die beim Wiederherstellen nie übernommen werden (neu vergeben bzw. durch den Wiederherstellenden bestimmt). */
const DROPPED_KEYS = ['id', 'user_id', 'created_at'] as const

/**
 * Eine gesicherte Ausgabe als neue Zeile. `accountIdMap` ordnet alte Konto-IDs den neu angelegten zu
 * (unbekanntes Konto → null). Ein fehlendes Datum wird aus `created_at`, sonst aus `nowIso` gefüllt.
 */
export function expenseForRestore(
    exp: BackupExpense,
    accountIdMap: ReadonlyMap<number, number>,
    userId: string,
    nowIso: string,
): BackupExpense {
    const row: BackupExpense = { ...exp }
    for (const k of DROPPED_KEYS) delete row[k]

    const oldAccount = row.account_id as number | null | undefined
    row.account_id = oldAccount && accountIdMap.has(oldAccount) ? accountIdMap.get(oldAccount)! : null

    if (!row.expense_date && exp.created_at) row.expense_date = exp.created_at
    if (!row.expense_date) row.expense_date = nowIso

    // Teilung lösen (siehe oben); share_note bleibt als Hinweistext.
    row.shared_purchase_id = null
    row.share_total = null
    row.share_mode = null

    return { ...row, user_id: userId }
}

/** Wie viele dieser Ausgaben sind gerade geteilt (tragen eine Teilung)? */
export function countActiveShares(rows: ReadonlyArray<{ shared_purchase_id?: string | null }> | null | undefined): number {
    return (rows ?? []).filter((r) => !!r.shared_purchase_id).length
}

/** Rückfrage vor dem Löschen, wenn gerade geteilte Ausgaben bestehen. */
export function restoreSharesWarning(activeShares: number): string {
    return activeShares === 1
        ? 'Achtung: 1 Ausgabe ist gerade mit deinem Freund geteilt. Beim Wiederherstellen wird die Teilung auf deiner Seite gelöst (die Kopie deines Freundes bleibt als normale Ausgabe bei ihm stehen). Trotzdem fortfahren?'
        : `Achtung: ${activeShares} Ausgaben sind gerade mit deinem Freund geteilt. Beim Wiederherstellen werden die Teilungen auf deiner Seite gelöst (die Kopien deines Freundes bleiben als normale Ausgaben bei ihm stehen). Trotzdem fortfahren?`
}
