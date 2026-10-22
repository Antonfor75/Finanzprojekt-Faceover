import { supabaseAdmin } from '@/utils/supabase/admin'
import { endUserSharing, wipeUserRows } from '@/utils/accountDeletion'
import { removeAllReceiptImages } from '@/lib/receiptScanStorage'

/**
 * Löscht ein Konto endgültig: Bonbilder, alle Nutzerzeilen, Personenbezug an Einladungscodes
 * und zuletzt den Auth-Nutzer. Nur serverseitig (Service-Role) und nur für Konten, deren
 * Löschfrist abgelaufen ist (app/api/purge-deleted-accounts) bzw. auf ausdrücklichen Wunsch
 * des Admins. Bricht bei einem Fehler ab, damit nie ein Auth-Nutzer ohne seine Daten übrig bleibt.
 */
export async function purgeAccount(userId: string): Promise<void> {
    if (!userId) throw new Error('Keine User-ID.')
    await removeAllReceiptImages(userId).catch((e) => console.warn('Bonbilder löschen:', e))
    await wipeUserRows(supabaseAdmin, userId)

    // Personenbezug an Einladungscodes entfernen; die Nutzung selbst zählt weiter.
    const { error: redemptionError } = await supabaseAdmin
        .from('invite_code_redemptions').delete().eq('user_id', userId)
    if (redemptionError && redemptionError.code !== '42P01' && redemptionError.code !== 'PGRST205') {
        console.warn('Einlösungen entfernen:', redemptionError.message)
    }
    await supabaseAdmin.from('invite_codes').update({ used_by: null }).eq('used_by', userId)

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) throw new Error(error.message)
}
