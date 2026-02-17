'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export type ImportExpense = {
    amount: number
    category: string
    description: string
    expense_date: string // ISO Date string
}

export type ImportIncome = {
    title: string
    amount: number
    frequency: 'monthly' | 'yearly' | 'weekly' | 'daily'
    valid_from?: string
    valid_to?: string
}

export type ImportFixedCost = {
    title: string
    amount: number
    valid_from?: string
    valid_to?: string
}

export type ImportAccount = {
    name: string
    amount: number
    type: 'distribution' | 'savings'
    valid_from?: string
}

export type BulkImportPayload = {
    expenses?: ImportExpense[]
    income?: ImportIncome[]
    fixedCosts?: ImportFixedCost[]
    accounts?: ImportAccount[]
}

export async function bulkImportAll(payload: BulkImportPayload) {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            throw new Error('Not authenticated')
        }

        const results = {
            expenses: 0,
            income: 0,
            fixedCosts: 0,
            accounts: 0,
            errors: [] as string[]
        }

        // 1. Expenses
        if (payload.expenses?.length) {
            const { error } = await supabase.from('expenses').insert(
                payload.expenses.map(e => ({ ...e, user_id: user.id }))
            )
            if (error) results.errors.push(`Expenses Error: ${error.message}`)
            else results.expenses = payload.expenses.length
        }

        // 2. Income
        if (payload.income?.length) {
            const { error } = await supabase.from('income_sources').insert(
                payload.income.map(i => ({
                    user_id: user.id,
                    title: i.title,
                    amount: i.amount,
                    frequency: i.frequency,
                    valid_from: i.valid_from || new Date().toISOString(),
                    valid_to: i.valid_to
                }))
            )
            if (error) results.errors.push(`Income Error: ${error.message}`)
            else results.income = payload.income.length
        }

        // 3. Fixed Costs
        if (payload.fixedCosts?.length) {
            const { error } = await supabase.from('fixed_costs').insert(
                payload.fixedCosts.map(fc => ({
                    user_id: user.id,
                    title: fc.title,
                    amount: fc.amount,
                    valid_from: fc.valid_from || new Date().toISOString(),
                    valid_to: fc.valid_to
                }))
            )
            if (error) results.errors.push(`Fixed Costs Error: ${error.message}`)
            else results.fixedCosts = payload.fixedCosts.length
        }

        // 4. Accounts
        if (payload.accounts?.length) {
            // For accounts, we just insert. Collisions might happen if name is unique?
            // Assuming no unique constraint on name for now, or user handles it.
            const { error } = await supabase.from('accounts').insert(
                payload.accounts.map(a => ({
                    user_id: user.id,
                    name: a.name,
                    amount: a.amount,
                    type: a.type,
                    valid_from: a.valid_from || new Date().toISOString(),
                    months: a.type === 'distribution' ? 1 : 0 // Default
                }))
            )
            if (error) results.errors.push(`Accounts Error: ${error.message}`)
            else results.accounts = payload.accounts.length
        }

        return { success: true, results }

    } catch (error: any) {
        console.error('Bulk Import Exception:', error)
        return { success: false, error: error.message }
    }
}
