'use server'

import { createClient } from '@/utils/supabase/server'
import { encryptSecret } from '@/utils/crypto'
import { verifyMailboxLogin } from '@/utils/mailbox'

/**
 * Server Actions für den "Gmail verbinden"-Flow in den Einstellungen.
 *
 * Es wird der cookie-basierte Server-Client genutzt (respektiert RLS als
 * eingeloggter User). Das App-Passwort wird vor dem Speichern per IMAP getestet
 * und AES-256-GCM-verschlüsselt abgelegt — der Klartext verlässt nie den Server.
 */

export type SaveConnectionInput = {
    email: string
    appPassword: string
}

export type ConnectionStatus = {
    connected: boolean
    email_address?: string
    status?: 'connected' | 'error'
    last_sync_at?: string | null
    last_error?: string | null
}

export async function saveEmailConnection(input: SaveConnectionInput) {
    const email = input.email?.trim()
    // Google zeigt App-Passwörter mit Leerzeichen an ("abcd efgh ijkl mnop") —
    // die Leerzeichen gehören nicht zum Passwort.
    const appPassword = input.appPassword?.replace(/\s+/g, '')

    if (!email || !appPassword) {
        return { success: false, error: 'E-Mail und App-Passwort sind erforderlich.' }
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return { success: false, error: 'Nicht eingeloggt.' }
    }

    // 1. Zugangsdaten sofort per echtem IMAP-Login verifizieren.
    try {
        await verifyMailboxLogin({ email, password: appPassword })
    } catch (err) {
        return {
            success: false,
            error: 'Login fehlgeschlagen. Prüfe E-Mail und App-Passwort (2FA aktiv? App-Passwort korrekt?).',
            detail: err instanceof Error ? err.message : undefined,
        }
    }

    // 2. Verschlüsseln + speichern (Upsert pro User).
    let secret_encrypted: string
    try {
        secret_encrypted = encryptSecret(appPassword)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: `Konfigurationsfehler beim Verschlüsseln: ${msg}` }
    }

    const { error: upsertError } = await supabase
        .from('email_connections')
        .upsert(
            {
                user_id: user.id,
                provider: 'imap',
                email_address: email,
                secret_encrypted,
                status: 'connected',
                last_error: null,
            },
            { onConflict: 'user_id' },
        )

    if (upsertError) {
        return { success: false, error: `Speichern fehlgeschlagen: ${upsertError.message}` }
    }

    return { success: true }
}

export async function getEmailConnectionStatus(): Promise<ConnectionStatus> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { connected: false }

    // Bewusst OHNE secret_encrypted selektieren.
    const { data } = await supabase
        .from('email_connections')
        .select('email_address, status, last_sync_at, last_error')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!data) return { connected: false }
    return {
        connected: true,
        email_address: data.email_address,
        status: data.status,
        last_sync_at: data.last_sync_at,
        last_error: data.last_error,
    }
}

export async function deleteEmailConnection() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nicht eingeloggt.' }

    const { error } = await supabase
        .from('email_connections')
        .delete()
        .eq('user_id', user.id)

    if (error) return { success: false, error: error.message }
    return { success: true }
}
