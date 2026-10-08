import { describe, it, expect, vi, beforeEach } from 'vitest'

// Nachgebaute DB: ein Code mit Kontingent, dieselben Regeln wie claim_invite_code.
type Code = { id: number; code: string; max_uses: number; use_count: number; used_at: string | null; used_by: string | null; expires_at: string | null }
const db = vi.hoisted(() => ({
    codes: [] as Code[],
    redemptions: [] as { code_id: number; user_id: string }[],
    users: [] as { id: string; email: string; user_metadata: Record<string, unknown> }[],
    failCreate: false,
}))

vi.mock('@/utils/supabase/admin', () => {
    const rpc = async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'claim_invite_code') {
            const c = db.codes.find(c => c.code === args.p_code)
            if (!c) return { data: [{ code_id: null, status: 'invalid' }], error: null }
            if (c.used_at || c.use_count >= c.max_uses) return { data: [{ code_id: c.id, status: 'exhausted' }], error: null }
            if (c.expires_at && new Date(c.expires_at) <= new Date()) return { data: [{ code_id: c.id, status: 'expired' }], error: null }
            c.use_count++
            if (c.use_count >= c.max_uses) c.used_at = new Date().toISOString()
            return { data: [{ code_id: c.id, status: 'ok' }], error: null }
        }
        if (fn === 'release_invite_code') {
            const c = db.codes.find(c => c.id === args.p_id)!
            c.use_count = Math.max(0, c.use_count - 1)
            c.used_at = null
            return { data: null, error: null }
        }
        throw new Error('unbekannte rpc ' + fn)
    }
    const from = (table: string) => ({
        insert: async (row: { code_id: number; user_id: string }) => {
            if (table === 'invite_code_redemptions') db.redemptions.push(row)
            return { error: null }
        },
        update: (patch: Partial<Code>) => ({
            eq: (_col: string, id: number) => ({
                is: async () => {
                    const c = db.codes.find(c => c.id === id)
                    if (c && c.used_by === null) Object.assign(c, patch)
                    return { error: null }
                },
            }),
        }),
    })
    const createUser = async ({ email, user_metadata }: { email: string; user_metadata: Record<string, unknown> }) => {
        if (db.failCreate) return { data: { user: null }, error: { message: 'Database error' } }
        if (db.users.some(u => u.email === email)) return { data: { user: null }, error: { message: 'User already registered' } }
        const user = { id: `u${db.users.length + 1}`, email, user_metadata }
        db.users.push(user)
        return { data: { user }, error: null }
    }
    return { supabaseAdmin: { rpc, from, auth: { admin: { createUser } } } }
})

import { signUpWithInviteCode } from '../auth'
import { PRIVACY_VERSION } from '@/lib/legal/operator'

const PW = 'geheim123'
const signUp = (email: string, code = 'TEAM-2222', privacy = true) => signUpWithInviteCode(email, PW, code, privacy)

beforeEach(() => {
    db.codes = [
        { id: 1, code: 'TEAM-2222', max_uses: 2, use_count: 0, used_at: null, used_by: null, expires_at: null },
        { id: 2, code: 'ALT2-ABCD', max_uses: 5, use_count: 0, used_at: null, used_by: null, expires_at: '2020-01-01T00:00:00Z' },
    ]
    db.redemptions = []
    db.users = []
    db.failCreate = false
})

describe('signUpWithInviteCode', () => {
    it('ein Code für 2 Personen: zwei klappen, die dritte wird abgewiesen', async () => {
        expect(await signUp('a@x.de')).toEqual({ success: true })
        expect(await signUp('b@x.de')).toEqual({ success: true })
        const third = await signUp('c@x.de')
        expect(third.success).toBe(false)
        expect(!third.success && third.error).toMatch(/allen eingeladenen Personen/)
        expect(db.users.map(u => u.email)).toEqual(['a@x.de', 'b@x.de'])
        expect(db.redemptions).toEqual([{ code_id: 1, user_id: 'u1', redeemed_at: expect.any(String) }, { code_id: 1, user_id: 'u2', redeemed_at: expect.any(String) }])
    })

    it('Tippvarianten des Codes werden akzeptiert', async () => {
        expect(await signUp('a@x.de', ' team 2222 ')).toEqual({ success: true })
    })

    it('speichert die Datenschutz-Bestätigung am Nutzer', async () => {
        await signUp('a@x.de')
        expect(db.users[0].user_metadata).toMatchObject({ privacy_version: PRIVACY_VERSION, privacy_accepted_at: expect.any(String) })
    })

    it('ohne Datenschutz-Häkchen wird nichts beansprucht', async () => {
        const r = await signUp('a@x.de', 'TEAM-2222', false)
        expect(r.success).toBe(false)
        expect(db.codes[0].use_count).toBe(0)
        expect(db.users).toHaveLength(0)
    })

    it('scheitert das Anlegen, wird der Platz wieder frei', async () => {
        db.failCreate = true
        expect((await signUp('a@x.de')).success).toBe(false)
        expect(db.codes[0].use_count).toBe(0)
        db.failCreate = false
        expect(await signUp('a@x.de')).toEqual({ success: true })
    })

    it('doppelte E-Mail verbrennt keinen Platz', async () => {
        await signUp('a@x.de')
        const r = await signUp('a@x.de')
        expect(!r.success && r.error).toMatch(/bereits einen Account/)
        expect(db.codes[0].use_count).toBe(1)
    })

    it('abgelaufener und unbekannter Code', async () => {
        const expired = await signUp('a@x.de', 'ALT2-ABCD')
        expect(!expired.success && expired.error).toMatch(/abgelaufen/)
        const unknown = await signUp('a@x.de', 'NOPE-NOPE')
        expect(!unknown.success && unknown.error).toMatch(/ungültig/)
    })

    it('used_by bekommt die erste Person (für ältere App-Stände)', async () => {
        await signUp('a@x.de')
        await signUp('b@x.de')
        expect(db.codes[0].used_by).toBe('u1')
    })
})
