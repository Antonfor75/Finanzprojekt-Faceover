'use server'

import { supabaseAdmin as supabase } from '@/utils/supabase/admin' // Use admin client to bypass RLS if needed, or normal client if user context is enough. Using admin for safety in background tasks.
import { startOfWeek, endOfWeek, subWeeks, format, isBefore, parseISO, addWeeks } from 'date-fns'
import { isBudgetRelevantExpense } from '@/utils/funAccount'

export async function processWeeklySavings(userId: string) {
    console.log('--- Checking Weekly Savings ---', userId)

    try {
        // 1. Get Settings & Expenses
        const { data: settings, error: settingsError } = await supabase
            .from('settings')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (settingsError || !settings) return { success: false, error: 'No settings found' }

        // 2. Determine Timeframe
        // "last_processed_week" should store the ISO string of the *start* of the last processed week.
        // If null, we assume we start tracking from "now" (or the first expense? Let's safeguard to now/creation).

        const now = new Date()
        const lastSunday = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) // Last full week's Sunday 23:59:59 roughly

        let currentProcessWeekStart = settings.last_processed_week
            ? parseISO(settings.last_processed_week)
            : startOfWeek(now, { weekStartsOn: 1 }) // If never processed, start tracking from THIS week (no back-calculation to avoid shock)

        // Correction: If it's a new account, we don't process past weeks.
        if (!settings.last_processed_week) {
            // Initialize with current week start so we process NEXT week
            const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
            await supabase.from('settings').update({
                last_processed_week: currentWeekStart.toISOString()
            }).eq('id', settings.id)
            return { success: true, message: 'Initialized tracking' }
        }

        const fullWeeksToProcess = []

        // Loop: Check if the "next" week after the last processed one has fully passed
        // Next week to process starts 1 week after the last processed week
        let nextWeekToProcess = addWeeks(currentProcessWeekStart, 1)

        // While the END of the "next week to process" is in the past...
        while (isBefore(endOfWeek(nextWeekToProcess, { weekStartsOn: 1 }), now)) {
            fullWeeksToProcess.push(nextWeekToProcess)
            nextWeekToProcess = addWeeks(nextWeekToProcess, 1)
        }

        if (fullWeeksToProcess.length === 0) {
            return { success: true, message: 'Up to date' }
        }

        console.log(`Processing ${fullWeeksToProcess.length} past weeks...`)

        // 3. Calculate & Update
        let totalChange = 0
        const { data: expenses } = await supabase.from('expenses').select('*').eq('user_id', userId)

        // Get Weekly Budget (Gross)
        const weeklyBudgetGross = Number(settings.monthly_budget) / 4.33

        // Get Fixed Costs (Weekly share)
        const { data: fixedCosts } = await supabase.from('fixed_costs').select('*').eq('user_id', userId)
        const totalFixedMonthly = fixedCosts?.reduce((sum, fc) => sum + Number(fc.amount), 0) || 0
        const weeklyFixed = totalFixedMonthly / 4.33

        const weeklyNet = weeklyBudgetGross - weeklyFixed

        for (const weekStart of fullWeeksToProcess) {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

            // Sum budget-relevant expenses for this week (account-paid expenses are neutral)
            const weekExpenses = expenses?.filter(e => {
                const d = new Date(e.expense_date || e.created_at)
                return d >= weekStart && d <= weekEnd && isBudgetRelevantExpense(e)
            }).reduce((sum, e) => sum + Number(e.amount), 0) || 0

            const leftover = weeklyNet - weekExpenses
            totalChange += leftover

            console.log(`Week ${format(weekStart, 'yyyy-MM-dd')}: Budget ${weeklyNet.toFixed(2)} - Exp ${weekExpenses.toFixed(2)} = ${leftover.toFixed(2)}`)
        }

        // 4. Commit Transaction (Update Balance & pointer)
        const newBalance = Number(settings.savings_balance || 0) + totalChange
        const newLastProcessed = fullWeeksToProcess[fullWeeksToProcess.length - 1].toISOString()

        const { error: updateError } = await supabase
            .from('settings')
            .update({
                savings_balance: newBalance,
                last_processed_week: newLastProcessed
            })
            .eq('id', settings.id)

        if (updateError) throw updateError

        return { success: true, processedWeeks: fullWeeksToProcess.length, newBalance }

    } catch (error: any) {
        console.error('Savings processing failed:', error)
        return { success: false, error: error.message }
    }
}
