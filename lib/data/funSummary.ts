import { supabase } from '@/utils/supabase'
import { calculateFunAccountSaldo, classifyGroupBucket } from '@/utils/funAccountGroups'
import type { FunGroup } from '@/app/types'

// Daten für die Spaßkonto-Kacheln auf dem Dashboard. null = kein Spaßkonto angelegt.
export type FunSummary = {
    accountId: number
    saldo: number
    currentGroup: FunGroup | null
} | null

/**
 * Lädt Saldo und aktuelle Gruppe des Spaßkontos. Wird beim Start parallel zu den
 * übrigen Daten geladen (app/page.tsx), damit die Kachel nicht nachflackert, und vom
 * Dashboard nach dem Schließen des Hubs bzw. nach einer Schnell-Ausgabe erneut.
 */
export async function loadFunSummary(): Promise<FunSummary> {
    const { data: funAccount } = await supabase.from('fun_accounts_v2').select('*').maybeSingle()
    if (!funAccount) return null
    const [{ data: funExpenses }, { data: funIncome }, { data: funGroups }] = await Promise.all([
        supabase.from('fun_group_expenses').select('amount, expense_date').eq('fun_account_id', funAccount.id),
        supabase.from('fun_income_entries').select('amount, income_date').eq('fun_account_id', funAccount.id),
        supabase.from('fun_groups').select('*').eq('fun_account_id', funAccount.id).order('start_date', { ascending: true }),
    ])
    return {
        accountId: funAccount.id,
        saldo: calculateFunAccountSaldo(funExpenses || [], funIncome || [], funAccount.foresight_enabled),
        currentGroup: ((funGroups || []) as FunGroup[]).find(g => classifyGroupBucket(g) === 'aktuell') || null,
    }
}
