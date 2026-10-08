'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { normalizeCode } from '@/utils/inviteCode'
import { validatePassword } from '@/utils/authRules'
import { PRIVACY_VERSION } from '@/lib/legal/operator'

type SignUpResult = { success: true } | { success: false; error: string }

/**
 * Registrierung mit Einladungscode.
 *
 * Läuft bewusst komplett serverseitig über die service_role: die Tabelle
 * `invite_codes` hat RLS ohne Policy, ein nicht angemeldeter Client kommt also
 * nicht an die Codes und kann sie auch nicht durchprobieren-lesen.
 *
 * Ein Code gilt für `max_uses` Personen. Zuerst wird atomar ein Platz beansprucht
 * und erst danach der User angelegt — so wird das Kontingent auch bei parallelen
 * Anfragen nie überschritten. Schlägt das Anlegen fehl, wird der Platz wieder frei.
 */
export async function signUpWithInviteCode(
    email: string,
    password: string,
    inviteCode: string,
    privacyAccepted: boolean
): Promise<SignUpResult> {
    const cleanEmail = email.trim().toLowerCase()
    const code = normalizeCode(inviteCode)

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return { success: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
    }

    const passwordError = validatePassword(password)
    if (passwordError) return { success: false, error: passwordError }

    // Serverseitig prüfen — das Häkchen im Formular allein ist kein Nachweis.
    if (privacyAccepted !== true) {
        return { success: false, error: 'Bitte bestätige die Datenschutzerklärung.' }
    }

    if (!code) return { success: false, error: 'Bitte einen Einladungscode eingeben.' }

    try {
        const nowIso = new Date().toISOString()

        // Atomar einen Platz auf dem Code beanspruchen. Kontingent (max_uses) und
        // Ablauf prüft die DB-Funktion in EINEM UPDATE — parallele Registrierungen
        // können das Kontingent so nicht überschreiten (Migration 0007).
        const { data: claimRows, error: claimError } = await supabaseAdmin
            .rpc('claim_invite_code', { p_code: code })

        if (claimError) {
            console.error('Invite-Code beanspruchen fehlgeschlagen:', claimError)
            return { success: false, error: 'Der Einladungscode konnte nicht geprüft werden.' }
        }

        const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as
            { code_id: number | null; status: 'ok' | 'invalid' | 'exhausted' | 'expired' } | undefined

        if (!claim || claim.status !== 'ok' || claim.code_id == null) {
            const messages = {
                exhausted: 'Dieser Einladungscode wurde bereits von allen eingeladenen Personen verwendet.',
                expired: 'Dieser Einladungscode ist abgelaufen.',
                invalid: 'Dieser Einladungscode ist ungültig.',
                ok: 'Dieser Einladungscode ist ungültig.',
            } as const
            return { success: false, error: messages[claim?.status ?? 'invalid'] }
        }
        const codeId = claim.code_id

        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password,
            email_confirm: true, // kein Bestätigungslink — der Einladungscode ist der Türsteher
            user_metadata: { privacy_accepted_at: nowIso, privacy_version: PRIVACY_VERSION },
        })

        if (createError || !created?.user) {
            // Platz wieder freigeben, damit er nicht durch einen Fehlversuch verbrannt ist.
            await supabaseAdmin.rpc('release_invite_code', { p_id: codeId })

            const message = createError?.message || ''
            if (/already|exists|registered/i.test(message)) {
                return { success: false, error: 'Zu dieser E-Mail-Adresse gibt es bereits einen Account.' }
            }
            console.error('User anlegen fehlgeschlagen:', createError)
            return { success: false, error: 'Der Account konnte nicht angelegt werden.' }
        }

        // Festhalten, wer eingelöst hat. Ein Fehler hier darf die fertige
        // Registrierung nicht mehr kippen — der Zähler stimmt ohnehin schon.
        const { error: redemptionError } = await supabaseAdmin
            .from('invite_code_redemptions')
            .insert({ code_id: codeId, user_id: created.user.id, redeemed_at: nowIso })
        if (redemptionError) console.error('Einlösung festhalten fehlgeschlagen:', redemptionError)

        // used_by (erste Person) weiter pflegen — ältere App-Stände lesen nur dieses Feld.
        await supabaseAdmin
            .from('invite_codes')
            .update({ used_by: created.user.id })
            .eq('id', codeId)
            .is('used_by', null)

        return { success: true }
    } catch (err: any) {
        console.error('Registrierung fehlgeschlagen:', err)
        return { success: false, error: 'Unerwarteter Fehler bei der Registrierung.' }
    }
}
