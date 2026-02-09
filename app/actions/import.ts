'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export type ImportExpense = {
    amount: number
    category: string
    description: string
    expense_date: string // ISO Date string
}

export async function bulkImportExpenses(expenses: ImportExpense[]) {
    // Await the client creation (Next.js 15 pattern)
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            console.error('Import Auth Error:', authError)
            console.log('Cookies present:', (await cookies()).getAll().map(c => c.name))
            throw new Error('Not authenticated')
        }

        const expensesToInsert = expenses.map(e => ({
            user_id: user.id,
            amount: e.amount,
            category: e.category,
            description: e.description,
            expense_date: e.expense_date
        }))

        const { error } = await supabase
            .from('expenses')
            .insert(expensesToInsert)

        if (error) {
            console.error('Bulk Import Error:', error)
            return { success: false, error: error.message }
        }

        return { success: true, count: expenses.length }

    } catch (error: any) {
        console.error('Bulk Import Exception:', error)
        return { success: false, error: error.message }
    }
}
