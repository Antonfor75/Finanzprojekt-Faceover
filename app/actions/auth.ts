'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { normalizeCode } from '@/utils/inviteCode'
import { validatePassword } from '@/utils/authRules'

type SignUpResult = { success: true } | { success: false; error: string }

/**
 * Registrierung mit Einladungscode.
 *
 * Läuft bewusst komplett serverseitig über die service_role: die Tabelle
 * `invite_codes` hat RLS ohne Policy, ein nicht angemeldeter Client kommt also
 * nicht an die Codes und kann sie auch nicht durchprobieren-lesen.
 *
 * Der Code wird ZUERST atomar beansprucht und erst danach der User angelegt —
 * so kann derselbe Code nicht von zwei parallelen Anfragen eingelöst werden.
 * Schlägt das Anlegen fehl, wird der Code wieder freigegeben.
 */
export async function signUpWithInviteCode(
    email: string,
    password: string,
    inviteCode: string
): Promise<SignUpResult> {
    const cleanEmail = email.trim().toLowerCase()
    const code = normalizeCode(inviteCode)

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return { success: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }
    }

    const passwordError = validatePassword(password)
    if (passwordError) return { success: false, error: passwordError }

    if (!code) return { success: false, error: 'Bitte einen Einladungscode eingeben.' }

    try {
        const nowIso = new Date().toISOString()

        // Atomar beanspruchen: greift nur, solange der Code noch frei ist. Damit kann
        // derselbe Code nicht von zwei parallelen Anfragen eingelöst werden.
        // Die Ablaufprüfung passiert bewusst DANACH und nicht als .or()-Filter —
        // PostgREST verträgt `or` auf einem UPDATE nicht (meldet 42703).
        const { data: claimed, error: claimError } = await supabaseAdmin
            .from('invite_codes')
            .update({ used_at: nowIso })
            .eq('code', code)
            .is('used_at', null)
            .select('id, expires_at')
            .maybeSingle()

        if (claimError) {
            console.error('Invite-Code beanspruchen fehlgeschlagen:', claimError)
            return { success: false, error: 'Der Einladungscode konnte nicht geprüft werden.' }
        }

        if (!claimed) {
            // Kein Treffer — entweder gibt es den Code nicht oder er ist schon weg.
            const { data: existing } = await supabaseAdmin
                .from('invite_codes')
                .select('used_at')
                .eq('code', code)
                .maybeSingle()

            return {
                success: false,
                error: existing?.used_at
                    ? 'Dieser Einladungscode wurde bereits verwendet.'
                    : 'Dieser Einladungscode ist ungültig.',
            }
        }

        if (claimed.expires_at && new Date(claimed.expires_at) <= new Date()) {
            // Wieder freigeben — abgelaufen heißt nicht "verbraucht".
            await supabaseAdmin.from('invite_codes').update({ used_at: null }).eq('id', claimed.id)
            return { success: false, error: 'Dieser Einladungscode ist abgelaufen.' }
        }

        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password,
            email_confirm: true, // kein Bestätigungslink — der Einladungscode ist der Türsteher
        })

        if (createError || !created?.user) {
            // Code wieder freigeben, damit er nicht durch einen Fehlversuch verbrannt ist.
            await supabaseAdmin.from('invite_codes').update({ used_at: null }).eq('id', claimed.id)

            const message = createError?.message || ''
            if (/already|exists|registered/i.test(message)) {
                return { success: false, error: 'Zu dieser E-Mail-Adresse gibt es bereits einen Account.' }
            }
            console.error('User anlegen fehlgeschlagen:', createError)
            return { success: false, error: 'Der Account konnte nicht angelegt werden.' }
        }

        await supabaseAdmin
            .from('invite_codes')
            .update({ used_by: created.user.id })
            .eq('id', claimed.id)

        return { success: true }
    } catch (err: any) {
        console.error('Registrierung fehlgeschlagen:', err)
        return { success: false, error: 'Unerwarteter Fehler bei der Registrierung.' }
    }
}
