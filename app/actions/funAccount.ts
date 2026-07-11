'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/utils/supabase'
import { getMonthsToCredit } from '@/utils/funAccount'

function currentMonthKey(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function addFunAccount(name: string, initialAmount: number, monthlyFeed: number | null) {
    if (!name.trim() || isNaN(initialAmount) || initialAmount < 0) {
        return { success: false, error: 'Ungültige Eingabe' }
    }

    // processed_month = current month: the first automatic feed lands next month
    // (consistent with the fixed cost drip starting at valid_from)
    const { data: account, error } = await supabase
        .from('accounts')
        .insert({
            name: name.trim(),
            amount: initialAmount,
            start_amount: initialAmount,
            months: 0,
            type: 'fun',
            processed_month: currentMonthKey(),
            valid_from: new Date().toISOString()
        })
        .select()
        .single()

    if (error || !account) {
        console.error('Error creating fun account:', error)
        return { success: false, error: error?.message }
    }

    if (monthlyFeed && monthlyFeed > 0) {
        const { error: fcError } = await supabase.from('fixed_costs').insert({
            title: `Spaßkonto: ${name.trim()}`,
            amount: monthlyFeed,
            frequency: 'monthly',
            linked_account_id: account.id,
            valid_from: new Date().toISOString()
        })
        if (fcError) console.error('Error creating feed fixed cost:', fcError)
    }

    if (initialAmount > 0) {
        const { error: txError } = await supabase.from('account_transactions').insert({
            account_id: account.id,
            amount: initialAmount,
            type: 'manual_deposit',
            note: 'Startguthaben'
        })
        if (txError) console.error('Error logging initial deposit:', txError)
    }

    revalidatePath('/')
    return { success: true, accountId: account.id }
}

export async function depositToFunAccount(accountId: number, amount: number, note?: string) {
    if (isNaN(amount) || amount <= 0) {
        return { success: false, error: 'Betrag muss größer als 0 sein' }
    }

    const { data: account, error } = await supabase
        .from('accounts').select('*').eq('id', accountId).single()

    if (error || !account) return { success: false, error: 'Konto nicht gefunden' }

    const { error: updateError } = await supabase
        .from('accounts')
        .update({ amount: Number(account.amount) + amount })
        .eq('id', accountId)

    if (updateError) {
        console.error('Error depositing:', updateError)
        return { success: false, error: updateError.message }
    }

    const { error: txError } = await supabase.from('account_transactions').insert({
        account_id: accountId,
        amount,
        type: 'manual_deposit',
        note: note || null
    })
    if (txError) console.error('Error logging deposit:', txError)

    revalidatePath('/')
    return { success: true }
}

export async function setFunAccountFeed(accountId: number, monthlyFeed: number | null) {
    const { data: account } = await supabase
        .from('accounts').select('*').eq('id', accountId).single()
    if (!account) return { success: false, error: 'Konto nicht gefunden' }

    const { data: existingFeed } = await supabase
        .from('fixed_costs').select('*').eq('linked_account_id', accountId).maybeSingle()

    if (!monthlyFeed || monthlyFeed <= 0) {
        // Remove the feed
        if (existingFeed) {
            await supabase.from('fixed_costs').delete().eq('id', existingFeed.id)
        }
    } else if (existingFeed) {
        await supabase.from('fixed_costs')
            .update({ amount: monthlyFeed, title: `Spaßkonto: ${account.name}` })
            .eq('id', existingFeed.id)
    } else {
        await supabase.from('fixed_costs').insert({
            title: `Spaßkonto: ${account.name}`,
            amount: monthlyFeed,
            frequency: 'monthly',
            linked_account_id: accountId,
            valid_from: new Date().toISOString()
        })
    }

    revalidatePath('/')
    return { success: true }
}

export async function addAccountExpense(
    accountId: number,
    amount: number,
    category: string,
    description: string,
    expenseDate: string
) {
    if (isNaN(amount) || amount <= 0 || !expenseDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }

    const { data: account, error } = await supabase
        .from('accounts').select('*').eq('id', accountId).single()

    if (error || !account) return { success: false, error: 'Konto nicht gefunden' }

    // Hard limit: no overdraft on accounts
    if (Number(account.amount) < amount) {
        return { success: false, error: 'Nicht genug Guthaben auf dem Konto' }
    }

    const { error: updateError } = await supabase
        .from('accounts')
        .update({ amount: Number(account.amount) - amount })
        .eq('id', accountId)

    if (updateError) {
        console.error('Error deducting from account:', updateError)
        return { success: false, error: updateError.message }
    }

    // The expense keeps its REAL category; account_id marks it budget-neutral
    const { error: insertError } = await supabase.from('expenses').insert({
        description: description || category || 'Sonstiges',
        amount,
        expense_date: expenseDate,
        category: category || 'Sonstiges',
        account_id: accountId
    })

    if (insertError) {
        console.error('Error inserting account expense:', insertError)
        // Roll the deduction back so balance and expenses stay consistent
        await supabase.from('accounts')
            .update({ amount: Number(account.amount) })
            .eq('id', accountId)
        return { success: false, error: insertError.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function processFunAccountFeeds() {
    const { data: accounts } = await supabase
        .from('accounts').select('*').eq('type', 'fun')

    if (!accounts || accounts.length === 0) return { success: true, credited: 0 }

    const { data: feeds } = await supabase
        .from('fixed_costs').select('*')
        .in('linked_account_id', accounts.map(a => a.id))

    let credited = 0

    for (const account of accounts) {
        const feed = feeds?.find(fc => fc.linked_account_id === account.id)
        if (!feed || Number(feed.amount) <= 0) continue

        const months = getMonthsToCredit(
            account.processed_month || null,
            feed.valid_from || null,
            feed.valid_to || null
        )
        if (months.length === 0) continue

        const feedAmount = Number(feed.amount)
        const newBalance = Number(account.amount) + feedAmount * months.length
        const newProcessed = months[months.length - 1]

        // Optimistic lock on processed_month: prevents double-crediting from two tabs
        let query = supabase
            .from('accounts')
            .update({ amount: newBalance, processed_month: newProcessed })
            .eq('id', account.id)
        query = account.processed_month
            ? query.eq('processed_month', account.processed_month)
            : query.is('processed_month', null)
        const { data: updated, error: updateError } = await query.select()

        if (updateError || !updated || updated.length === 0) continue

        const { error: txError } = await supabase.from('account_transactions').insert(
            months.map(month => ({
                account_id: account.id,
                amount: feedAmount,
                type: 'auto_deposit',
                note: `Monatliche Einzahlung ${month}`
            }))
        )
        if (txError) console.error('Error logging auto deposits:', txError)

        credited += months.length
    }

    if (credited > 0) revalidatePath('/')
    return { success: true, credited }
}

export async function deleteFunAccount(id: number) {
    // Cascade: linked feed fixed cost + deposit history.
    // Orphaned expenses.account_id is tolerated by deleteExpenseLocal's guard.
    await supabase.from('fixed_costs').delete().eq('linked_account_id', id)
    await supabase.from('account_transactions').delete().eq('account_id', id)
    const { error } = await supabase.from('accounts').delete().eq('id', id)

    if (error) {
        console.error('Error deleting fun account:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}
