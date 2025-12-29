'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '@/utils/supabase'

export async function addExpense(formData: FormData) {
    let description = formData.get('description') as string
    const amount = parseFloat(formData.get('amount') as string)
    const expense_date = formData.get('date') as string
    let category = formData.get('category') as string || 'Sonstiges'

    // If description is empty, use category name
    if (!description) {
        description = category
    }

    if (isNaN(amount) || !expense_date) {
        return
    }

    // CHECK IF CATEGORY IS A SAVINGS ACCOUNT
    if (category.startsWith('account:')) {
        const accountId = parseInt(category.split(':')[1])
        const { data: account } = await supabase.from('accounts').select('*').eq('id', accountId).single()

        if (account && account.amount >= amount) {
            // Deduct from Savings
            await supabase.from('accounts').update({ amount: account.amount - amount }).eq('id', accountId)

            // Rewrite category for display
            category = `Konto: ${account.name}`
            // We do NOT want this to affect the Weekly Budget negatively? 
            // The user implies they want to "access via expenses".
            // If I pay from Savings, my "Daily Available" shouldn't drop.
            // So we need to flag this expense. Since we can't change Schema easily,
            // we will insert it but maybe future logic filters it?
            // User Request: "...can only be accessed via expenses"
            // If I buy a Gift (50€) from Savings (500€), Savings -> 450€.
            // Should "Budget" change? No.
            // Should "Expenses List" show "Gift 50€"? Yes.
            // Should "Available" drop by 50€? No.

            // TRICK: We insert the Expense (50€) AND an Income (50€) simultaneously?
            // Or we just insert the Expense with a special flag?
            // Let's rely on the special Category Name `Konto: ...` to filter in Frontend!
        } else {
            // Insufficient funds or error
            return
        }
    }

    const { error } = await supabase
        .from('expenses')
        .insert([
            { description, amount, expense_date, category }
        ])

    if (error) {
        console.error('Error inserting expense:', error)
        return
    }

    revalidatePath('/')
}

export async function updateExpense(id: number, formData: FormData) {
    let description = formData.get('description') as string
    const amount = parseFloat(formData.get('amount') as string)
    const expense_date = formData.get('date') as string
    const category = formData.get('category') as string || 'Sonstiges'

    // If description is empty, use category name
    if (!description) {
        description = category
    }

    if (isNaN(amount) || !expense_date) {
        return
    }

    const { error } = await supabase
        .from('expenses')
        .update({ description, amount, expense_date, category })
        .eq('id', id)

    if (error) {
        console.error('Error updating expense:', error)
        return
    }

    revalidatePath('/')
}

export async function deleteExpense(id: number) {
    const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting expense:', error)
        return
    }

    revalidatePath('/')
}

// Consolidated Settings Update
export async function updateSettings(budget: number) {
    const { data, error: updateError } = await supabase
        .from('settings')
        .update({
            monthly_budget: budget,
        })
        .eq('id', 1)
        .select()

    // If no row exists, insert one
    if (updateError || !data || data.length === 0) {
        const { error: insertError } = await supabase
            .from('settings')
            .insert([{
                monthly_budget: budget,
            }])
        if (insertError) console.error('Error inserting settings:', insertError)
    }

    revalidatePath('/')
}

export async function updateMonthlyBudget(amount: number) {
    // Deprecated wrapper, calling updateSettings with current values requires fetching them first
    // But for now, let's keep it simple and just update budget if used by old code,
    // OR strictly enforce using the new function.
    // Given current usage, let's Redirect to a partial update if possible?
    // Supabase update patches only specified fields, so this is fine to keep as is,
    // BUT we should verify if we want to replace it.
    // I'll keep it for backward compat but use updateSettings in SettingsOverlay.
    const { error } = await supabase
        .from('settings')
        .update({ monthly_budget: amount })
        .eq('id', 1)

    if (error) console.error('Error updating budget:', error)
    revalidatePath('/')
}

export async function addFixedCost(title: string, amount: number) {
    const { error } = await supabase
        .from('fixed_costs')
        .insert([{ title, amount }])

    if (error) console.error('Error adding fixed cost:', error)
    revalidatePath('/')
}

export async function deleteFixedCost(id: number) {
    const { error } = await supabase
        .from('fixed_costs')
        .delete()
        .eq('id', id)

    if (error) console.error('Error deleting fixed cost:', error)
    revalidatePath('/')
}

// Account Actions
export async function addAccount(name: string, amount: number, months: number, type: 'distribution' | 'savings') {
    const { error } = await supabase
        .from('accounts')
        .insert([{ name, amount, months, type }])

    if (error) console.error('Error adding account:', error)
    revalidatePath('/')
}

export async function deleteAccount(id: number) {
    const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)

    if (error) console.error('Error deleting account:', error)
    revalidatePath('/')
}

export async function transferFromSavings(accountId: number, amount: number) {
    // 1. Get Account
    const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single()

    if (!account || account.amount < amount) return

    // 2. Deduct from Account
    await supabase.from('accounts').update({ amount: account.amount - amount }).eq('id', accountId)

    // 3. Add "Negative Expense" (Income) to Expenses to boost budget
    await supabase.from('expenses').insert([{
        description: `Transfer von ${account.name}`,
        amount: -amount, // Negative amount increases budget
        expense_date: new Date().toISOString(),
        category: 'Sparen'
    }])

    revalidatePath('/')
}

export async function getBudgetSettings() {
    const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .single()

    const { data: fixedCosts } = await supabase
        .from('fixed_costs')
        .select('*')

    const { data: accounts } = await supabase
        .from('accounts')
        .select('*')

    const monthlyBudget = settings?.monthly_budget || 0
    const fixedCostsList = fixedCosts || []
    const accountsList = accounts || []

    const fixedCostsTotal = fixedCostsList.reduce((acc, curr) => acc + curr.amount, 0)

    // Check if new month logic is needed for calculations but we process savings separately
    const weeklyBudget = (monthlyBudget - fixedCostsTotal) / 4

    return {
        settings: settings || { monthly_budget: 0, savings_balance: 0, savings_months_remaining: 0 },
        monthlyBudget,
        fixedCosts: fixedCostsList,
        accounts: accountsList,
        fixedCostsTotal,
        weeklyBudget
    }
}

// Lazy Trigger for Monthly Savings Distribution (Only for 'distribution' type)
export async function checkAndProcessSavings() {
    const { data: accounts } = await supabase
        .from('accounts')
        .select('*')

    // Safety check if column doesn't exist yet but code shouldn't break hard
    // We assume DB is updated as per user confirmation

    const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .single()

    if (!settings || !accounts) return

    const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

    // We iterate over all accounts and check if they need processing for this month
    let budgetIncrease = 0
    let updatesMade = false

    for (const account of accounts) {
        // ONLY PROCESS DISTRIBUTION ACCOUNTS
        if (account.type === 'distribution' &&
            account.processed_month !== currentMonth &&
            account.amount > 0 &&
            account.months > 0) {

            const amountToDistribute = account.amount / account.months

            // Update Account
            const { error: accError } = await supabase
                .from('accounts')
                .update({
                    amount: account.amount - amountToDistribute,
                    months: account.months - 1,
                    processed_month: currentMonth
                })
                .eq('id', account.id)

            if (!accError) {
                budgetIncrease += amountToDistribute
                updatesMade = true
            } else {
                console.error(`Error processing account ${account.name}:`, accError)
            }
        }
    }

    if (updatesMade && budgetIncrease > 0) {
        console.log(`Increasing budget by ${budgetIncrease} from savings accounts...`)
        const newBudget = settings.monthly_budget + budgetIncrease

        const { error: settingsError } = await supabase
            .from('settings')
            .update({ monthly_budget: newBudget })
            .eq('id', settings.id)

        if (settingsError) {
            console.error('Error updating budget from savings:', settingsError)
        } else {
            revalidatePath('/')
        }
    }
}
