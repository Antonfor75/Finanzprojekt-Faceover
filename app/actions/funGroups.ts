'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function getOrCreateFunAccountV2() {
    const supabase = await createClient()

    const { data: existing, error: selectError } = await supabase
        .from('fun_accounts_v2').select('*').maybeSingle()

    if (selectError) {
        console.error('Error loading fun account v2:', selectError)
        return { success: false, error: selectError.message }
    }
    if (existing) return { success: true, account: existing }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nicht eingeloggt' }

    const { data: created, error: insertError } = await supabase
        .from('fun_accounts_v2')
        .insert({ name: 'Spaßkonto', foresight_enabled: true, user_id: user.id })
        .select()
        .single()

    if (insertError || !created) {
        console.error('Error creating fun account v2:', insertError)
        return { success: false, error: insertError?.message }
    }

    revalidatePath('/')
    return { success: true, account: created }
}

export async function renameFunAccountV2(id: number, name: string) {
    if (!name.trim()) {
        return { success: false, error: 'Name darf nicht leer sein' }
    }
    const supabase = await createClient()

    const { error } = await supabase
        .from('fun_accounts_v2')
        .update({ name: name.trim() })
        .eq('id', id)

    if (error) {
        console.error('Error renaming fun account v2:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function setFunAccountForesight(id: number, enabled: boolean) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('fun_accounts_v2')
        .update({ foresight_enabled: enabled })
        .eq('id', id)

    if (error) {
        console.error('Error updating foresight setting:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function createFunGroup(
    funAccountId: number,
    name: string,
    startDate: string,
    endDate: string | null
) {
    if (!name.trim() || !startDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }
    if (endDate && endDate < startDate) {
        return { success: false, error: '"Bis" darf nicht vor "Von" liegen' }
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nicht eingeloggt' }

    const { data: group, error } = await supabase
        .from('fun_groups')
        .insert({
            fun_account_id: funAccountId,
            name: name.trim(),
            start_date: startDate,
            end_date: endDate || null,
            user_id: user.id
        })
        .select()
        .single()

    if (error || !group) {
        console.error('Error creating fun group:', error)
        return { success: false, error: error?.message }
    }

    revalidatePath('/')
    return { success: true, groupId: group.id }
}

export async function updateFunGroup(
    id: number,
    name: string,
    startDate: string,
    endDate: string | null
) {
    if (!name.trim() || !startDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }
    if (endDate && endDate < startDate) {
        return { success: false, error: '"Bis" darf nicht vor "Von" liegen' }
    }
    const supabase = await createClient()

    const { error } = await supabase
        .from('fun_groups')
        .update({ name: name.trim(), start_date: startDate, end_date: endDate || null })
        .eq('id', id)

    if (error) {
        console.error('Error updating fun group:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function deleteFunGroup(id: number) {
    const supabase = await createClient()

    // Manuelles Cascade: Einträge bleiben erhalten, verlieren nur ihre Gruppen-Zuordnung.
    await supabase.from('fun_group_expenses').update({ group_id: null }).eq('group_id', id)
    await supabase.from('fun_income_entries').update({ group_id: null }).eq('group_id', id)

    const { error } = await supabase.from('fun_groups').delete().eq('id', id)

    if (error) {
        console.error('Error deleting fun group:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function addFunGroupExpense(
    funAccountId: number,
    amount: number,
    description: string,
    expenseDate: string,
    groupId: number | null
) {
    if (isNaN(amount) || amount <= 0 || !expenseDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nicht eingeloggt' }

    const { error } = await supabase.from('fun_group_expenses').insert({
        fun_account_id: funAccountId,
        group_id: groupId,
        amount,
        description: description || null,
        expense_date: expenseDate,
        user_id: user.id
    })

    if (error) {
        console.error('Error adding fun group expense:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function updateFunGroupExpense(
    id: number,
    amount: number,
    description: string,
    expenseDate: string,
    groupId: number | null
) {
    if (isNaN(amount) || amount <= 0 || !expenseDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }
    const supabase = await createClient()

    const { error } = await supabase.from('fun_group_expenses').update({
        amount,
        description: description || null,
        expense_date: expenseDate,
        group_id: groupId
    }).eq('id', id)

    if (error) {
        console.error('Error updating fun group expense:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function deleteFunGroupExpense(id: number) {
    const supabase = await createClient()
    const { error } = await supabase.from('fun_group_expenses').delete().eq('id', id)

    if (error) {
        console.error('Error deleting fun group expense:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function addFunIncomeEntry(
    funAccountId: number,
    amount: number,
    description: string,
    incomeDate: string,
    groupId: number | null
) {
    if (isNaN(amount) || amount <= 0 || !incomeDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nicht eingeloggt' }

    const { error } = await supabase.from('fun_income_entries').insert({
        fun_account_id: funAccountId,
        group_id: groupId,
        amount,
        description: description || null,
        income_date: incomeDate,
        user_id: user.id
    })

    if (error) {
        console.error('Error adding fun income entry:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function updateFunIncomeEntry(
    id: number,
    amount: number,
    description: string,
    incomeDate: string,
    groupId: number | null
) {
    if (isNaN(amount) || amount <= 0 || !incomeDate) {
        return { success: false, error: 'Ungültige Eingabe' }
    }
    const supabase = await createClient()

    const { error } = await supabase.from('fun_income_entries').update({
        amount,
        description: description || null,
        income_date: incomeDate,
        group_id: groupId
    }).eq('id', id)

    if (error) {
        console.error('Error updating fun income entry:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function deleteFunIncomeEntry(id: number) {
    const supabase = await createClient()
    const { error } = await supabase.from('fun_income_entries').delete().eq('id', id)

    if (error) {
        console.error('Error deleting fun income entry:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}
