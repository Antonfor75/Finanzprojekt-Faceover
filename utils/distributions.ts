import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Verteilkonten: zahlt pro Monat einmal amount / months ins Budget aus und erhöht
 * settings.monthly_budget um die Summe. Läuft live in der Server Action
 * runStartupJobs (app/actions/startup.ts), in der Demo gegen den localStorage-Client.
 * Gibt true zurück, wenn etwas ausgezahlt wurde (dann müssen die Daten neu geladen werden).
 */
export async function processMonthlyDistributions(client: Pick<SupabaseClient, 'from'>): Promise<boolean> {
    const { data: accounts } = await client.from('accounts').select('*')
    const { data: settings } = await client.from('settings').select('*').single()

    if (!settings || !accounts) return false

    const currentMonth = new Date().toISOString().slice(0, 7)
    let budgetIncrease = 0
    let updatesMade = false

    for (const account of accounts) {
        if (account.type === 'distribution' &&
            account.processed_month !== currentMonth &&
            account.amount > 0 &&
            account.months > 0) {

            // Check valid_from
            if (account.valid_from) {
                const validFromMonth = new Date(account.valid_from).toISOString().slice(0, 7)
                if (currentMonth < validFromMonth) continue
            }

            const amountToDistribute = account.amount / account.months

            await client.from('accounts').update({
                amount: account.amount - amountToDistribute,
                months: account.months - 1,
                processed_month: currentMonth
            }).eq('id', account.id)

            budgetIncrease += amountToDistribute
            updatesMade = true
        }
    }

    if (updatesMade && budgetIncrease > 0) {
        await client.from('settings').update({
            monthly_budget: settings.monthly_budget + budgetIncrease
        }).eq('id', settings.id)
        return true
    }
    return false
}
