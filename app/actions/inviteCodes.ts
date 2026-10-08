'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { assertAdmin, ADMIN_EMAIL } from '@/utils/adminGuard'
import { generateCode, parseMaxUses, MAX_INVITE_USES } from '@/utils/inviteCode'
import { createClient } from '@/utils/supabase/server'

export type InviteCode = {
    id: number
    code: string
    note: string | null
    created_at: string
    expires_at: string | null
    used_at: string | null
    used_by: string | null
    max_uses: number
    use_count: number
    redemptions: InviteRedemption[]
}

export type InviteRedemption = { user_id: string; redeemed_at: string }

const CODE_COLUMNS = 'id, code, note, created_at, expires_at, used_at, used_by, max_uses, use_count'

/** Alle Codes, neueste zuerst. Nur für den Admin. */
export async function listInviteCodes() {
    try {
        await assertAdmin()

        const [codesRes, redemptionsRes] = await Promise.all([
            supabaseAdmin.from('invite_codes').select(CODE_COLUMNS).order('created_at', { ascending: false }),
            supabaseAdmin.from('invite_code_redemptions').select('code_id, user_id, redeemed_at').order('redeemed_at'),
        ])

        if (codesRes.error) throw new Error(codesRes.error.message)
        if (redemptionsRes.error) throw new Error(redemptionsRes.error.message)

        const byCode = new Map<number, InviteRedemption[]>()
        for (const r of redemptionsRes.data || []) {
            const list = byCode.get(r.code_id) || []
            list.push({ user_id: r.user_id, redeemed_at: r.redeemed_at })
            byCode.set(r.code_id, list)
        }

        const codes = (codesRes.data || []).map(c => ({ ...c, redemptions: byCode.get(c.id) || [] })) as InviteCode[]
        return { success: true as const, codes }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

/**
 * Erzeugt einen neuen Einladungscode.
 * `expiresInDays` = 0 oder undefined bedeutet: läuft nie ab.
 * `maxUses` = für wie viele Personen der Code gilt (1–100, Standard 1).
 */
export async function generateInviteCode(note?: string, expiresInDays?: number, maxUses: number = 1) {
    try {
        await assertAdmin()

        const uses = parseMaxUses(maxUses)
        if (uses === null) throw new Error(`Die Personenzahl muss zwischen 1 und ${MAX_INVITE_USES} liegen.`)

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
                    max_uses: uses,
                    created_by: user?.id ?? null,
                })
                .select(CODE_COLUMNS)
                .single()

            if (!error && data) {
                return { success: true as const, code: { ...data, redemptions: [] } as InviteCode }
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

/** E-Mail-Adressen zu den User-IDs, damit die Liste zeigt, wer eingelöst hat. */
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
