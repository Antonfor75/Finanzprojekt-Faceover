'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { assertAdmin, ADMIN_EMAIL } from '@/utils/adminGuard'
import { generateCode } from '@/utils/inviteCode'
import { createClient } from '@/utils/supabase/server'

export type InviteCode = {
    id: number
    code: string
    note: string | null
    created_at: string
    expires_at: string | null
    used_at: string | null
    used_by: string | null
}

/** Alle Codes, neueste zuerst. Nur für den Admin. */
export async function listInviteCodes() {
    try {
        await assertAdmin()

        const { data, error } = await supabaseAdmin
            .from('invite_codes')
            .select('id, code, note, created_at, expires_at, used_at, used_by')
            .order('created_at', { ascending: false })

        if (error) throw new Error(error.message)

        return { success: true as const, codes: (data || []) as InviteCode[] }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

/**
 * Erzeugt einen neuen Einladungscode.
 * `expiresInDays` = 0 oder undefined bedeutet: läuft nie ab.
 */
export async function generateInviteCode(note?: string, expiresInDays?: number) {
    try {
        await assertAdmin()

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        const expiresAt = expiresInDays && expiresInDays > 0
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : null

        // Bei der (sehr unwahrscheinlichen) Kollision mit einem vorhandenen Code neu würfeln.
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = generateCode()
            const { data, error } = await supabaseAdmin
                .from('invite_codes')
                .insert({
                    code,
                    note: note?.trim() || null,
                    expires_at: expiresAt,
                    created_by: user?.id ?? null,
                })
                .select('id, code, note, created_at, expires_at, used_at, used_by')
                .single()

            if (!error && data) {
                return { success: true as const, code: data as InviteCode }
            }
            // 23505 = unique_violation → nächster Versuch mit neuem Code
            if (error && error.code !== '23505') throw new Error(error.message)
        }

        throw new Error('Es konnte kein freier Code erzeugt werden. Bitte erneut versuchen.')
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

/** Löscht einen Code (z. B. versehentlich erzeugt oder nicht mehr gewollt). */
export async function deleteInviteCode(id: number) {
    try {
        await assertAdmin()

        const { error } = await supabaseAdmin.from('invite_codes').delete().eq('id', id)
        if (error) throw new Error(error.message)

        return { success: true as const }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

/** E-Mail-Adressen zu den `used_by`-IDs, damit die Liste zeigt, wer eingelöst hat. */
export async function getInviteCodeRedeemers() {
    try {
        await assertAdmin()

        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers()
        if (error) throw new Error(error.message)

        const map: Record<string, string> = {}
        for (const u of users) {
            if (u.email && u.email !== ADMIN_EMAIL) map[u.id] = u.email
        }
        return { success: true as const, emails: map }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}
