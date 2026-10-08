'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { wipeUserRows } from '@/utils/accountDeletion'
import { ADMIN_EMAIL } from '@/utils/adminGuard'

type Result = { success: true } | { success: false; error: string }

/**
 * Der eingeloggte Nutzer löscht sein eigenes Konto (Art. 17 DSGVO).
 *
 * Wer gelöscht wird, kommt AUSSCHLIESSLICH aus der Session im Cookie — nie aus
 * einem Parameter. Die getippte E-Mail dient nur als Schutz vor Versehen.
 */
export async function deleteOwnAccount(confirmEmail: string): Promise<Result> {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return { success: false, error: 'Nicht angemeldet.' }

        if (user.email === ADMIN_EMAIL) {
            return { success: false, error: 'Das Admin-Konto kann hier nicht gelöscht werden.' }
        }
        if ((confirmEmail || '').trim().toLowerCase() !== (user.email || '').toLowerCase()) {
            return { success: false, error: 'Die eingegebene E-Mail stimmt nicht mit deinem Konto überein.' }
        }

        await wipeUserRows(supabaseAdmin, user.id)

        // Personenbezug an Einladungscodes entfernen; die Nutzung selbst zählt weiter.
        const { error: redemptionError } = await supabaseAdmin
            .from('invite_code_redemptions').delete().eq('user_id', user.id)
        if (redemptionError && redemptionError.code !== '42P01' && redemptionError.code !== 'PGRST205') {
            console.warn('Einlösungen entfernen:', redemptionError.message)
        }
        await supabaseAdmin.from('invite_codes').update({ used_by: null }).eq('used_by', user.id)

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
        if (deleteError) throw new Error(deleteError.message)

        return { success: true }
    } catch (err: any) {
        console.error('Konto löschen fehlgeschlagen:', err)
        return { success: false, error: 'Das Konto konnte nicht gelöscht werden. Bitte versuche es später erneut.' }
    }
}
