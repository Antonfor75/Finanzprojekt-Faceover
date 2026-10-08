'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import {
    planTransfer,
    validateTransferInput,
    directionFromGiroAmount,
    giroExpenseAmount,
    funEffect,
    roundCents,
    type TransferInput,
    type TransferDirection,
} from '@/utils/transfer'

/**
 * Umbuchungen Girokonto <-> Spaßkonto (Regeln und Zeilenaufbau: utils/transfer.ts).
 *
 * Es gibt keine DB-Transaktion über mehrere Tabellen hinweg (PostgREST). Deshalb wird jeder
 * erfolgreiche Schritt mit einem Rücknahme-Schritt vermerkt; scheitert ein späterer Schritt,
 * laufen die Rücknahmen rückwärts. So bleiben beide Seiten mit demselben Betrag beieinander
 * (gleiches Muster wie addAccountExpense in funAccount.ts).
 */

type Supabase = Awaited<ReturnType<typeof createClient>>
type Undo = () => PromiseLike<unknown>
type Failure = { success: false; error: string }
const fail = (error: string): Failure => ({ success: false, error })

const MIGRATION_HINT = 'Datenbank-Migration 0007 (transfer_id) ist noch nicht eingespielt.'

function describeError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err)
    return /transfer_id/.test(msg) ? `${MIGRATION_HINT} (${msg})` : msg
}

async function rollback(undos: Undo[]) {
    for (const undo of [...undos].reverse()) {
        try {
            await undo()
        } catch (err) {
            console.error('[transfers] Rücknahme fehlgeschlagen:', err)
        }
    }
}

/** Ändert accounts.amount eines alten Spaßkontos um `delta` (ohne Überziehung, mit Schutz vor parallelen Änderungen). */
async function adjustLegacyBalance(
    supabase: Supabase,
    accountId: number,
    delta: number,
): Promise<{ ok: true; undo: Undo } | { ok: false; error: string }> {
    const { data: account, error } = await supabase
        .from('accounts').select('id, amount, type').eq('id', accountId).maybeSingle()
    if (error || !account || account.type !== 'fun') return { ok: false, error: 'Spaßkonto nicht gefunden.' }

    const before = account.amount
    const after = roundCents(Number(before) + delta)
    if (after < 0) return { ok: false, error: 'Nicht genug Guthaben auf dem Spaßkonto.' }

    const { data: updated, error: updateError } = await supabase
        .from('accounts').update({ amount: after }).eq('id', accountId).eq('amount', before).select('id')
    if (updateError) return { ok: false, error: updateError.message }
    if (!updated || updated.length === 0) {
        return { ok: false, error: 'Das Spaßkonto wurde gerade geändert – bitte erneut versuchen.' }
    }
    return {
        ok: true,
        undo: () => supabase.from('accounts').update({ amount: before }).eq('id', accountId).eq('amount', after),
    }
}

type TransferRows = {
    expenses: { id: number; amount: number | string }[]
    incomes: { id: number }[]
    funExpenses: { id: number }[]
    txs: { id: number; account_id: number; amount: number | string }[]
}

async function loadTransfer(supabase: Supabase, transferId: string): Promise<TransferRows> {
    const [exp, inc, fexp, tx] = await Promise.all([
        supabase.from('expenses').select('id, amount').eq('transfer_id', transferId),
        supabase.from('fun_income_entries').select('id').eq('transfer_id', transferId),
        supabase.from('fun_group_expenses').select('id').eq('transfer_id', transferId),
        supabase.from('account_transactions').select('id, account_id, amount').eq('transfer_id', transferId),
    ])
    const err = exp.error || inc.error || fexp.error || tx.error
    if (err) throw new Error(err.message)
    return { expenses: exp.data ?? [], incomes: inc.data ?? [], funExpenses: fexp.data ?? [], txs: tx.data ?? [] }
}

/** Richtung der Umbuchung — auch dann ermittelbar, wenn eine Seite schon fehlt. */
function directionOf(rows: TransferRows): TransferDirection {
    if (rows.expenses.length) return directionFromGiroAmount(Number(rows.expenses[0].amount))
    if (rows.incomes.length) return 'from_giro'
    if (rows.funExpenses.length) return 'to_giro'
    if (rows.txs.length) return Number(rows.txs[0].amount) >= 0 ? 'from_giro' : 'to_giro'
    return 'from_giro'
}

async function ownsV2Account(supabase: Supabase, id: number): Promise<boolean> {
    const { data } = await supabase.from('fun_accounts_v2').select('id').eq('id', id).maybeSingle()
    return !!data
}

export async function createTransfer(input: TransferInput) {
    const valid = validateTransferInput(input)
    if (!valid.ok) return fail(valid.error)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fail('Nicht eingeloggt.')

    if (input.target?.kind === 'v2' && !(await ownsV2Account(supabase, input.target.accountId))) {
        return fail('Spaßkonto nicht gefunden.')
    }

    const transferId = crypto.randomUUID()
    const plan = planTransfer({ ...input, amount: valid.amount, reason: valid.reason }, transferId)
    const undos: Undo[] = []

    try {
        // 1. Zuerst die Seite, die an einem Guthaben scheitern kann (altes Spaßkonto).
        if (plan.fun?.kind === 'legacy') {
            const adj = await adjustLegacyBalance(supabase, plan.fun.accountId, plan.fun.balanceDelta)
            if (!adj.ok) return fail(adj.error)
            undos.push(adj.undo)
        }

        // 2. Girokonto-Seite.
        const { data: expense, error: expenseError } = await supabase
            .from('expenses').insert({ ...plan.giro, user_id: user.id }).select('id').single()
        if (expenseError || !expense) throw new Error(expenseError?.message ?? 'Buchung auf dem Girokonto fehlgeschlagen.')
        undos.push(() => supabase.from('expenses').delete().eq('id', expense.id))

        // 3. Spaßkonto-Seite — exakt derselbe Betrag aus demselben Plan.
        if (plan.fun?.kind === 'v2_income') {
            const { error } = await supabase.from('fun_income_entries').insert({ ...plan.fun.row, user_id: user.id })
            if (error) throw new Error(error.message)
        } else if (plan.fun?.kind === 'v2_expense') {
            const { error } = await supabase.from('fun_group_expenses').insert({ ...plan.fun.row, user_id: user.id })
            if (error) throw new Error(error.message)
        } else if (plan.fun?.kind === 'legacy') {
            const { error } = await supabase.from('account_transactions').insert({ ...plan.fun.tx, user_id: user.id })
            if (error) throw new Error(error.message)
        }
    } catch (err) {
        await rollback(undos)
        console.error('[transfers] createTransfer fehlgeschlagen:', err)
        return fail(describeError(err))
    }

    revalidatePath('/')
    return { success: true as const, transferId }
}

export async function deleteTransfer(transferId: string) {
    if (!transferId) return fail('Umbuchung nicht gefunden.')
    const supabase = await createClient()
    const undos: Undo[] = []

    try {
        const rows = await loadTransfer(supabase, transferId)

        // 1. Altes Spaßkonto: den Saldo um genau die gebuchten Beträge zurücknehmen.
        const perAccount = new Map<number, number>()
        for (const t of rows.txs) perAccount.set(t.account_id, (perAccount.get(t.account_id) ?? 0) + Number(t.amount))
        for (const [accountId, sum] of perAccount) {
            const adj = await adjustLegacyBalance(supabase, accountId, -sum)
            if (!adj.ok) {
                await rollback(undos)
                return fail(adj.error)
            }
            undos.push(adj.undo)
        }

        // 2. Beide Seiten löschen. Schlägt hier etwas fehl, bleiben die übrigen Zeilen über
        //    transfer_id auffindbar, ein erneutes Löschen räumt den Rest auf.
        const steps: [string, string][] = [
            ['account_transactions', 'Buchungshistorie'],
            ['fun_income_entries', 'Spaßkonto-Einnahme'],
            ['fun_group_expenses', 'Spaßkonto-Ausgabe'],
            ['expenses', 'Girokonto-Buchung'],
        ]
        for (const [table, label] of steps) {
            const { error } = await supabase.from(table).delete().eq('transfer_id', transferId)
            if (error) {
                // Saldo nur zurückdrehen, solange die Historie noch steht, sonst würde er doppelt korrigiert.
                if (table === 'account_transactions') await rollback(undos)
                throw new Error(`${label}: ${error.message}`)
            }
        }
    } catch (err) {
        console.error('[transfers] deleteTransfer fehlgeschlagen:', err)
        return fail(describeError(err))
    }

    revalidatePath('/')
    return { success: true as const }
}

/** Setzt `patch` auf alle Zeilen der Umbuchung in `table` und merkt sich die alten Werte zum Zurückdrehen. */
async function patchByTransfer(
    supabase: Supabase,
    table: string,
    transferId: string,
    patch: Record<string, unknown>,
    undos: Undo[],
) {
    const { data: rows, error } = await supabase.from(table).select('*').eq('transfer_id', transferId)
    if (error) throw new Error(error.message)
    for (const row of rows ?? []) {
        const old = Object.fromEntries(Object.keys(patch).map((k) => [k, (row as Record<string, unknown>)[k]]))
        const { error: updateError } = await supabase.from(table).update(patch).eq('id', row.id)
        if (updateError) throw new Error(updateError.message)
        undos.push(() => supabase.from(table).update(old).eq('id', row.id))
    }
}

export async function updateTransfer(
    transferId: string,
    changes: { amount: number; reason: string; date: string },
) {
    if (!transferId) return fail('Umbuchung nicht gefunden.')
    const valid = validateTransferInput(changes)
    if (!valid.ok) return fail(valid.error)

    const supabase = await createClient()
    const undos: Undo[] = []

    try {
        const rows = await loadTransfer(supabase, transferId)
        const direction = directionOf(rows)
        const { amount, reason } = valid
        const { date } = changes

        // 1. Altes Spaßkonto: Saldo um die Differenz zum bisher gebuchten Betrag anpassen.
        for (const t of rows.txs) {
            const delta = roundCents(funEffect(direction, amount) - Number(t.amount))
            if (delta === 0) continue
            const adj = await adjustLegacyBalance(supabase, t.account_id, delta)
            if (!adj.ok) {
                await rollback(undos)
                return fail(adj.error)
            }
            undos.push(adj.undo)
        }

        // 2. Beide Seiten bekommen denselben neuen Betrag.
        await patchByTransfer(supabase, 'account_transactions', transferId,
            { amount: funEffect(direction, amount), note: reason, transaction_date: `${date}T12:00:00` }, undos)
        await patchByTransfer(supabase, 'fun_income_entries', transferId,
            { amount, description: reason, income_date: date }, undos)
        await patchByTransfer(supabase, 'fun_group_expenses', transferId,
            { amount, description: reason, expense_date: date }, undos)
        await patchByTransfer(supabase, 'expenses', transferId,
            { amount: giroExpenseAmount(direction, amount), description: reason, expense_date: date }, undos)
    } catch (err) {
        await rollback(undos)
        console.error('[transfers] updateTransfer fehlgeschlagen:', err)
        return fail(describeError(err))
    }

    revalidatePath('/')
    return { success: true as const }
}
