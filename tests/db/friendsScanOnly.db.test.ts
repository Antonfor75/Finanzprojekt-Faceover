import { describe, expect } from 'vitest'
import type { FriendState } from '@/utils/sharing/types'
import { asAdmin, asUser, dbTest, ensureMigration, loadMigration, makeUser, sqlError, type Tx } from './dbTest'

// Freunde nur für Konten mit Kassenbon-Scan (Migration 0014). Die Funktionen werden in jedem Test
// in die (zurückgerollte) Transaktion geladen, damit die Tests vor und nach dem Einspielen laufen.
const NOT_ENABLED = 'Freunde sind für dein Konto nicht freigeschaltet.'
const NOT_FOUND = 'Kein Konto mit diesem Namen gefunden.'

async function load(tx: Tx) {
    await ensureMigration(tx, 'drizzle/0012_friendships.sql', 'public.friendships')
    await ensureMigration(tx, 'drizzle/0013_shared_purchases.sql', 'public.shared_purchases')
    await loadMigration(tx, 'drizzle/0014_friends_scan_only.sql')
}

async function named(tx: Tx, handle: string, scan = true): Promise<string> {
    const id = await makeUser(tx, undefined, { scan })
    if (scan) {
        await asUser(tx, id)
        await tx`select set_my_handle(${handle})`
    } else {
        // Ein Konto ohne Scan kann sich selbst keinen Namen geben; für den Test setzt der Admin ihn.
        await asAdmin(tx)
        await tx`insert into profiles (user_id, handle) values (${id}, ${handle})`
    }
    await asAdmin(tx)
    return id
}

describe('ohne Kassenbon-Scan', () => {
    dbTest('Kontoname vergeben ist nicht erlaubt', async (tx) => {
        await load(tx)
        const id = await makeUser(tx, undefined, { scan: false })
        await asUser(tx, id)
        expect(await sqlError(tx, (sp) => sp`select set_my_handle('lena')`)).toBe(NOT_ENABLED)
    })

    dbTest('Anfrage senden ist nicht erlaubt', async (tx) => {
        await load(tx)
        await named(tx, 'anna')
        const id = await named(tx, 'ben', false)
        await asUser(tx, id)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('anna')`)).toBe(NOT_ENABLED)
    })

    dbTest('user_metadata zählt nicht, nur app_metadata', async (tx) => {
        await load(tx)
        await asAdmin(tx)
        const [row] = await tx<{ id: string }[]>`
            insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
            values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sdd-meta@example.invalid', 'x', now(), now(), '{}'::jsonb, '{"receipt_scan": true}'::jsonb)
            returning id`
        await asUser(tx, row.id)
        expect(await sqlError(tx, (sp) => sp`select set_my_handle('lena')`)).toBe(NOT_ENABLED)
    })
})

describe('Anfrage an ein Konto ohne Scan', () => {
    dbTest('wird wie "nicht gefunden" behandelt', async (tx) => {
        await load(tx)
        const a = await named(tx, 'anna')
        await named(tx, 'ben', false)
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('ben')`)).toBe(NOT_FOUND)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('gibt.es.nicht')`)).toBe(NOT_FOUND)
    })
})

describe('mit Kassenbon-Scan', () => {
    dbTest('Anfrage, Annehmen und Trennen funktionieren wie bisher', async (tx) => {
        await load(tx)
        const a = await named(tx, 'anna')
        const b = await named(tx, 'ben')
        await asUser(tx, a)
        const [sent] = await tx<{ s: FriendState }[]>`select send_friend_request('ben') as s`
        expect(sent.s.outgoing?.handle).toBe('ben')
        await asUser(tx, b)
        const [seen] = await tx<{ s: FriendState }[]>`select get_friend_state() as s`
        const [accepted] = await tx<{ s: FriendState }[]>`select respond_friend_request(${seen.s.incoming[0].id}::uuid, true) as s`
        expect(accepted.s.friend?.handle).toBe('anna')
        const [ended] = await tx<{ s: FriendState }[]>`select end_friendship() as s`
        expect(ended.s.friend).toBeNull()
    })

    dbTest('Annehmen scheitert, wenn dem Empfänger der Scan inzwischen entzogen wurde — Ablehnen geht', async (tx) => {
        await load(tx)
        const a = await named(tx, 'anna')
        const b = await named(tx, 'ben')
        await asUser(tx, a)
        await tx`select send_friend_request('ben')`
        await asAdmin(tx)
        await tx`update auth.users set raw_app_meta_data = '{}'::jsonb where id = ${b}`
        await asUser(tx, b)
        const [seen] = await tx<{ s: FriendState }[]>`select get_friend_state() as s`
        const requestId = seen.s.incoming[0].id
        expect(await sqlError(tx, (sp) => sp`select respond_friend_request(${requestId}::uuid, true)`)).toBe('Freunde sind für dieses Konto nicht freigeschaltet.')
        const [declined] = await tx<{ s: FriendState }[]>`select respond_friend_request(${requestId}::uuid, false) as s`
        expect(declined.s.incoming).toEqual([])
    })
})
