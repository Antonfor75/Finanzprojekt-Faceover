import { supabase } from '@/utils/supabase'

/** Backup aus einem PDF-Report wiederherstellen (ersetzt alle aktuellen Daten nach Rückfrage). */
export async function restoreBackup(event: React.ChangeEvent<HTMLInputElement>, onUpdate?: () => void) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
        const text = e.target?.result as string

        const startTag = 'BACKUP_DATA_START:'
        const endTag = ':BACKUP_DATA_END'

        const startIndex = text.indexOf(startTag)
        const endIndex = text.indexOf(endTag)

        if (startIndex === -1 || endIndex === -1) {
            alert('Keine gültigen Backup-Daten gefunden.')
            return
        }

        try {
            const jsonStr = text.substring(startIndex + startTag.length, endIndex)
            const data = JSON.parse(jsonStr)

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            if (confirm('Achtung: Dies wird alle aktuellen Daten löschen und durch das Backup ersetzen. Fortfahren?')) {
                // 1. Delete all existing
                await supabase.from('expenses').delete().neq('id', 0)
                await supabase.from('fixed_costs').delete().neq('id', 0)
                await supabase.from('accounts').delete().neq('id', 0)
                await supabase.from('income_sources').delete().neq('id', 0)

                // 2. Restore Settings
                // We only update setting fields, keeping ID/User static if possible, or fully update row
                if (data.settings) {
                    const { id, user_id, ...settingsData } = data.settings
                    const { error } = await supabase.from('settings').update(settingsData).eq('user_id', user.id)
                    if (error) console.error('Error restoring settings:', error)
                } else if (data.monthly_budget) {
                    // Legacy backup support
                    await supabase.from('settings').update({ monthly_budget: data.monthly_budget }).eq('user_id', user.id)
                }

                // 3. Restore Income Sources
                if (data.incomeSources?.length) {
                    const incomeToInsert = data.incomeSources.map((inv: any) => {
                        const { id, user_id, created_at, ...rest } = inv
                        return { ...rest, user_id: user.id }
                    })
                    await supabase.from('income_sources').insert(incomeToInsert)
                }

                // 4. Restore Accounts (and map IDs)
                const accountIdMap = new Map<number, number>()
                if (data.accounts?.length) {
                    // We must insert sequentially to get IDs or loop
                    for (const acc of data.accounts) {
                        const oldId = acc.id
                        const { id, user_id, created_at, ...accData } = acc
                        const { data: newAcc, error } = await supabase.from('accounts').insert({ ...accData, user_id: user.id }).select().single()
                        if (newAcc && !error) {
                            if (oldId) accountIdMap.set(oldId, newAcc.id)
                        } else {
                            console.error('Error restoring account:', error)
                        }
                    }
                }

                // 5. Restore Fixed Costs (with updated linked_account_id)
                if (data.fixedCosts?.length) {
                    const costsToInsert = data.fixedCosts.map((fc: any) => {
                        const { id, user_id, created_at, ...fcData } = fc
                        if (fcData.linked_account_id && accountIdMap.has(fcData.linked_account_id)) {
                            fcData.linked_account_id = accountIdMap.get(fcData.linked_account_id)
                        } else if (fcData.linked_account_id) {
                            fcData.linked_account_id = null // Unlink if account not found
                        }
                        // Legacy structure map?
                        if (!fcData.valid_from) fcData.valid_from = new Date().toISOString()
                        return { ...fcData, user_id: user.id }
                    })
                    await supabase.from('fixed_costs').insert(costsToInsert)
                }

                // 6. Restore Expenses (with updated account_id)
                if (data.expenses?.length) {
                    const expensesToInsert = data.expenses.map((exp: any) => {
                        const { id, user_id, created_at, ...expData } = exp
                        if (expData.account_id && accountIdMap.has(expData.account_id)) {
                            expData.account_id = accountIdMap.get(expData.account_id)
                        } else {
                            expData.account_id = null
                        }
                        // Ensure date exists
                        if (!expData.expense_date && expData.created_at) expData.expense_date = expData.created_at
                        if (!expData.expense_date) expData.expense_date = new Date().toISOString()

                        return { ...expData, user_id: user.id }
                    })
                    // Bulk insert
                    const { error } = await supabase.from('expenses').insert(expensesToInsert)
                    if (error) console.error('Error restoring expenses:', error)
                }

                onUpdate?.()
                alert('Backup erfolgreich wiederhergestellt!')
            }

        } catch (err) {
            console.error(err)
            alert('Fehler beim Lesen des Backups')
        }
    }
    reader.readAsText(file) // Try reading as text
}
