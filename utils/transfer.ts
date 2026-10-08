/**
 * Umbuchungen zwischen Girokonto und Spaßkonto.
 *
 * Kernregel: Es wird IMMER derselbe Betrag bewegt. Beide Seiten werden aus einem einzigen
 * (auf Cent gerundeten) Betrag abgeleitet und teilen sich eine `transfer_id`, damit Ändern
 * und Löschen später ebenfalls beide Seiten gleich treffen (app/actions/transfers.ts).
 *
 * Girokonto-Seite = normale Ausgabe in `expenses` (Konvention der App, siehe transferFromSavings):
 *   positiver Betrag  → Girokonto sinkt (Abbuchen),
 *   negativer Betrag  → Girokonto steigt (Hinzufügen).
 * Sie hat bewusst keine `account_id`, sonst gälte sie als budget-neutral (isBudgetRelevantExpense)
 * und würde das Girokonto gar nicht bewegen.
 */

/** from_giro: vom Girokonto abbuchen (das Spaßkonto bekommt das Geld). to_giro: aufs Girokonto buchen (das Spaßkonto gibt es ab). */
export type TransferDirection = 'from_giro' | 'to_giro'

/** 'v2' = neues Spaßkonto (fun_accounts_v2, Saldo aus Einträgen), 'legacy' = Konto aus den Einstellungen (accounts.amount). */
export type FunTarget = { kind: 'v2' | 'legacy'; accountId: number }

export const TRANSFER_CATEGORY = 'Umbuchung'
export const MANUAL_CATEGORY = 'Manuelle Buchung'

export type TransferInput = {
    direction: TransferDirection
    amount: number
    reason: string
    /** yyyy-MM-dd */
    date: string
    /** null = nur das Girokonto bewegen, kein Spaßkonto beteiligt. */
    target: FunTarget | null
}

export const roundCents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export type Validation =
    | { ok: true; amount: number; reason: string }
    | { ok: false; error: string }

export function validateTransferInput(input: Pick<TransferInput, 'amount' | 'reason' | 'date'>): Validation {
    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount)) {
        return { ok: false, error: 'Bitte einen gültigen Betrag eingeben.' }
    }
    const amount = roundCents(input.amount)
    if (amount <= 0) return { ok: false, error: 'Der Betrag muss größer als 0 sein.' }
    const reason = (input.reason ?? '').trim()
    if (!reason) return { ok: false, error: 'Bitte eine Begründung angeben.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) return { ok: false, error: 'Bitte ein Datum wählen.' }
    return { ok: true, amount, reason }
}

/** Wert der Girokonto-Ausgabe: Abbuchen = positive Ausgabe, Hinzufügen = negative Ausgabe. */
export const giroExpenseAmount = (direction: TransferDirection, amount: number): number =>
    direction === 'from_giro' ? amount : -amount

/** Änderung des Spaßkonto-Saldos: es bekommt Geld (+), wenn das Girokonto abgebucht wird, sonst gibt es ab (−). */
export const funEffect = (direction: TransferDirection, amount: number): number =>
    direction === 'from_giro' ? amount : -amount

/** Richtung einer bestehenden Umbuchung aus dem gespeicherten Girokonto-Betrag. */
export const directionFromGiroAmount = (storedGiroAmount: number): TransferDirection =>
    storedGiroAmount >= 0 ? 'from_giro' : 'to_giro'

export type TransferPlan = {
    giro: {
        description: string
        amount: number
        expense_date: string
        category: string
        transfer_id: string | null
    }
    fun:
        | null
        | { kind: 'v2_income'; row: { fun_account_id: number; amount: number; description: string; income_date: string; transfer_id: string } }
        | { kind: 'v2_expense'; row: { fun_account_id: number; amount: number; description: string; expense_date: string; transfer_id: string } }
        | {
              kind: 'legacy'
              accountId: number
              balanceDelta: number
              tx: { account_id: number; amount: number; type: 'transfer_in' | 'transfer_out'; note: string; transaction_date: string; transfer_id: string }
          }
}

/** Baut beide Seiten aus EINEM Betrag. Eingaben vorher mit validateTransferInput prüfen. */
export function planTransfer(input: TransferInput, transferId: string): TransferPlan {
    const { direction, amount, reason, date, target } = input
    const giro = {
        description: reason,
        amount: giroExpenseAmount(direction, amount),
        expense_date: date,
        category: target ? TRANSFER_CATEGORY : MANUAL_CATEGORY,
        transfer_id: target ? transferId : null,
    }
    if (!target) return { giro, fun: null }

    if (target.kind === 'v2') {
        return direction === 'from_giro'
            ? { giro, fun: { kind: 'v2_income', row: { fun_account_id: target.accountId, amount, description: reason, income_date: date, transfer_id: transferId } } }
            : { giro, fun: { kind: 'v2_expense', row: { fun_account_id: target.accountId, amount, description: reason, expense_date: date, transfer_id: transferId } } }
    }

    const delta = funEffect(direction, amount)
    return {
        giro,
        fun: {
            kind: 'legacy',
            accountId: target.accountId,
            balanceDelta: delta,
            tx: {
                account_id: target.accountId,
                amount: delta,
                type: delta >= 0 ? 'transfer_in' : 'transfer_out',
                note: reason,
                transaction_date: `${date}T12:00:00`,
                transfer_id: transferId,
            },
        },
    }
}
