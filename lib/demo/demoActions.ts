// Lokale Nachbauten der Server Actions für den Demo-Modus. Gleiche Regeln wie
// die echten Actions in app/actions/*, aber gegen den localStorage-Client.
import { getDemoClient, type Row } from './demoClient'
import type { BulkImportPayload } from '@/app/actions/import'
import type { ConnectionStatus } from '@/app/actions/emailConnection'

const db = () => getDemoClient()
const NOT_IN_DEMO = 'In der Demo nicht verfügbar — leg dir ein Konto an, um diese Funktion zu nutzen.'

async function getAccount(id: number) {
    const { data } = await db().from('accounts').select('*').eq('id', id).single()
    return data as Row | null
}

// --- Spaßkonto (alt) / Sparkonten --------------------------------------------

export async function addFunAccount(name: string, initialAmount: number, monthlyFeed: number | null) {
    if (!name.trim() || isNaN(initialAmount) || initialAmount < 0) return { success: false, error: 'Ungültige Eingabe' }
    const now = new Date()
    const { data: account } = await db().from('accounts').insert({
        name: name.trim(), amount: initialAmount, start_amount: initialAmount, months: 0, type: 'fun',
        processed_month: now.toISOString().slice(0, 7), valid_from: now.toISOString(),
    }).select().single()
    const acc = account as Row
    if (monthlyFeed && monthlyFeed > 0) {
        await db().from('fixed_costs').insert({
            title: `Spaßkonto: ${name.trim()}`, amount: monthlyFeed, frequency: 'monthly',
            linked_account_id: acc.id, valid_from: now.toISOString(),
        })
    }
    if (initialAmount > 0) {
        await db().from('account_transactions').insert({ account_id: acc.id, amount: initialAmount, type: 'manual_deposit', note: 'Startguthaben' })
    }
    return { success: true, accountId: acc.id as number }
}

export async function depositToFunAccount(accountId: number, amount: number, note?: string) {
    if (isNaN(amount) || amount <= 0) return { success: false, error: 'Betrag muss größer als 0 sein' }
    const account = await getAccount(accountId)
    if (!account) return { success: false, error: 'Konto nicht gefunden' }
    await db().from('accounts').update({ amount: Number(account.amount) + amount }).eq('id', accountId)
    await db().from('account_transactions').insert({ account_id: accountId, amount, type: 'manual_deposit', note: note || null })
    return { success: true }
}

export async function setFunAccountFeed(accountId: number, monthlyFeed: number | null) {
    const account = await getAccount(accountId)
    if (!account) return { success: false, error: 'Konto nicht gefunden' }
    const { data: feed } = await db().from('fixed_costs').select('*').eq('linked_account_id', accountId).maybeSingle()
    const existing = feed as Row | null
    if (!monthlyFeed || monthlyFeed <= 0) {
        if (existing) await db().from('fixed_costs').delete().eq('id', existing.id)
    } else if (existing) {
        await db().from('fixed_costs').update({ amount: monthlyFeed, title: `Spaßkonto: ${account.name}` }).eq('id', existing.id)
    } else {
        await db().from('fixed_costs').insert({
            title: `Spaßkonto: ${account.name}`, amount: monthlyFeed, frequency: 'monthly',
            linked_account_id: accountId, valid_from: new Date().toISOString(),
        })
    }
    return { success: true }
}

export async function addAccountExpense(accountId: number, amount: number, category: string, description: string, expenseDate: string) {
    if (isNaN(amount) || amount <= 0 || !expenseDate) return { success: false, error: 'Ungültige Eingabe' }
    const account = await getAccount(accountId)
    if (!account) return { success: false, error: 'Konto nicht gefunden' }
    if (Number(account.amount) < amount) return { success: false, error: 'Nicht genug Guthaben auf dem Konto' }
    await db().from('accounts').update({ amount: Number(account.amount) - amount }).eq('id', accountId)
    await db().from('expenses').insert({
        description: description || category || 'Sonstiges', amount, expense_date: expenseDate,
        category: category || 'Sonstiges', account_id: accountId,
    })
    return { success: true }
}

/** Die Beispieldaten sind schon „verarbeitet“ — in der Demo gibt es nichts gutzuschreiben. */
export async function processFunAccountFeeds() {
    return { success: true, credited: 0 }
}

export async function processWeeklySavings() {
    return { success: true }
}

// --- Spaßkonto mit Gruppen ---------------------------------------------------

export async function getOrCreateFunAccountV2() {
    const { data: existing } = await db().from('fun_accounts_v2').select('*').maybeSingle()
    if (existing) return { success: true, account: existing }
    const { data: created } = await db().from('fun_accounts_v2').insert({ name: 'Spaßkonto', foresight_enabled: true }).select().single()
    return { success: true, account: created }
}

export async function renameFunAccountV2(id: number, name: string) {
    if (!name.trim()) return { success: false, error: 'Name darf nicht leer sein' }
    await db().from('fun_accounts_v2').update({ name: name.trim() }).eq('id', id)
    return { success: true }
}

export async function setFunAccountForesight(id: number, enabled: boolean) {
    await db().from('fun_accounts_v2').update({ foresight_enabled: enabled }).eq('id', id)
    return { success: true }
}

function groupDatesError(name: string, startDate: string, endDate: string | null) {
    if (!name.trim() || !startDate) return 'Ungültige Eingabe'
    if (endDate && endDate < startDate) return '"Bis" darf nicht vor "Von" liegen'
    return null
}

export async function createFunGroup(funAccountId: number, name: string, startDate: string, endDate: string | null) {
    const error = groupDatesError(name, startDate, endDate)
    if (error) return { success: false, error }
    const { data } = await db().from('fun_groups').insert({
        fun_account_id: funAccountId, name: name.trim(), start_date: startDate, end_date: endDate || null,
    }).select().single()
    return { success: true, groupId: (data as Row).id as number }
}

export async function updateFunGroup(id: number, name: string, startDate: string, endDate: string | null) {
    const error = groupDatesError(name, startDate, endDate)
    if (error) return { success: false, error }
    await db().from('fun_groups').update({ name: name.trim(), start_date: startDate, end_date: endDate || null }).eq('id', id)
    return { success: true }
}

export async function deleteFunGroup(id: number) {
    await db().from('fun_group_expenses').update({ group_id: null }).eq('group_id', id)
    await db().from('fun_income_entries').update({ group_id: null }).eq('group_id', id)
    await db().from('fun_groups').delete().eq('id', id)
    return { success: true }
}

function entryError(amount: number, date: string) {
    return isNaN(amount) || amount <= 0 || !date ? 'Ungültige Eingabe' : null
}

export async function addFunGroupExpense(funAccountId: number, amount: number, description: string, expenseDate: string, groupId: number | null) {
    const error = entryError(amount, expenseDate)
    if (error) return { success: false, error }
    await db().from('fun_group_expenses').insert({
        fun_account_id: funAccountId, group_id: groupId, amount, description: description || null, expense_date: expenseDate,
    })
    return { success: true }
}

export async function updateFunGroupExpense(id: number, amount: number, description: string, expenseDate: string, groupId: number | null) {
    const error = entryError(amount, expenseDate)
    if (error) return { success: false, error }
    await db().from('fun_group_expenses').update({ amount, description: description || null, expense_date: expenseDate, group_id: groupId }).eq('id', id)
    return { success: true }
}

export async function deleteFunGroupExpense(id: number) {
    await db().from('fun_group_expenses').delete().eq('id', id)
    return { success: true }
}

export async function addFunIncomeEntry(funAccountId: number, amount: number, description: string, incomeDate: string, groupId: number | null) {
    const error = entryError(amount, incomeDate)
    if (error) return { success: false, error }
    await db().from('fun_income_entries').insert({
        fun_account_id: funAccountId, group_id: groupId, amount, description: description || null, income_date: incomeDate,
    })
    return { success: true }
}

export async function updateFunIncomeEntry(id: number, amount: number, description: string, incomeDate: string, groupId: number | null) {
    const error = entryError(amount, incomeDate)
    if (error) return { success: false, error }
    await db().from('fun_income_entries').update({ amount, description: description || null, income_date: incomeDate, group_id: groupId }).eq('id', id)
    return { success: true }
}

export async function deleteFunIncomeEntry(id: number) {
    await db().from('fun_income_entries').delete().eq('id', id)
    return { success: true }
}

// --- Import --------------------------------------------------------------------

export async function bulkImportAll(payload: BulkImportPayload) {
    const nowIso = new Date().toISOString()
    const results = { expenses: 0, income: 0, fixedCosts: 0, accounts: 0, errors: [] as string[] }
    if (payload.expenses?.length) {
        await db().from('expenses').insert(payload.expenses)
        results.expenses = payload.expenses.length
    }
    if (payload.income?.length) {
        await db().from('income_sources').insert(payload.income.map(i => ({ ...i, valid_from: i.valid_from || nowIso })))
        results.income = payload.income.length
    }
    if (payload.fixedCosts?.length) {
        await db().from('fixed_costs').insert(payload.fixedCosts.map(fc => ({ ...fc, valid_from: fc.valid_from || nowIso })))
        results.fixedCosts = payload.fixedCosts.length
    }
    if (payload.accounts?.length) {
        await db().from('accounts').insert(payload.accounts.map(a => ({
            ...a, valid_from: a.valid_from || nowIso, months: a.type === 'distribution' ? 1 : 0,
        })))
        results.accounts = payload.accounts.length
    }
    return { success: true, results }
}

// --- REWE-Postfach: braucht einen Server, gibt es in der Demo nicht -----------

export async function getEmailConnectionStatus(): Promise<ConnectionStatus> {
    return { connected: false }
}

export async function saveEmailConnection() {
    return { success: false, error: NOT_IN_DEMO }
}

export async function runReweSyncNow() {
    return { success: false as const, error: NOT_IN_DEMO }
}

export async function deleteEmailConnection() {
    return { success: false, error: NOT_IN_DEMO }
}
