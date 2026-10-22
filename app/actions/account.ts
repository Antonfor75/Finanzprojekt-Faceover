'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { BAN_FOREVER, DELETION_FLAG, endUserSharing } from '@/utils/accountDeletion'
import { removeAllReceiptImages } from '@/lib/receiptScanStorage'
import { ADMIN_EMAIL } from '@/utils/adminGuard'

type Result = { success: true } | { success: false; error: string }

/**
 * Der eingeloggte Nutzer löscht sein eigenes Konto (Art. 17 DSGVO) — mit Frist: Das Konto wird
 * sofort gesperrt und abgemeldet, die Daten bleiben aber DELETION_GRACE_DAYS (30) Tage erhalten
 * und werden danach vom täglichen Lauf endgültig gelöscht (lib/accountPurge.ts). Nur offene
 * Kassenbons samt Fotos (Arbeitsdaten) und Freundschaften gehen sofort weg.
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

        // Zuerst sperren und den Zeitpunkt merken — ab hier läuft die Frist, und das Konto ist unbenutzbar.
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            ban_duration: BAN_FOREVER,
            app_metadata: { [DELETION_FLAG]: new Date().toISOString() },
        })
        if (banError) throw new Error(banError.message)

        // Arbeitsdaten, die ohne Konto keinen Sinn mehr haben: offene Bons samt Fotos, Freundschaft und Teilungen
        // (der Freund behält seine Kopien als normale Ausgaben, siehe endUserSharing).
        await removeAllReceiptImages(user.id).catch((e) => console.warn('Bonbilder löschen:', e))
        warnUnlessMissing('pending_receipts', (await supabaseAdmin.from('pending_receipts').delete().eq('user_id', user.id)).error)
        await endUserSharing(supabaseAdmin, user.id)

        // Alle Sitzungen beenden (auch auf anderen Geräten); der Browser meldet sich danach selbst ab.
        await supabase.auth.signOut({ scope: 'global' }).catch((e) => console.warn('Abmelden:', e))

        return { success: true }
    } catch (err) {
        console.error('Konto löschen fehlgeschlagen:', err)
        return { success: false, error: 'Das Konto konnte nicht gelöscht werden. Bitte versuche es später erneut.' }
    }
}

/** Eine Tabelle, die es (noch) nicht gibt, ist kein Fehler; alles andere wird nur gemeldet (das Konto ist schon gesperrt). */
function warnUnlessMissing(table: string, error: { code?: string; message: string } | null): void {
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.warn(`${table} löschen:`, error.message)
}
