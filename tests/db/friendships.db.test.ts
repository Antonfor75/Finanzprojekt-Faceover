import { describe, expect } from 'vitest'
import type { FriendState } from '@/utils/sharing/types'
import { asAdmin, asAnon, asUser, dbTest, loadMigration, makeUser, sqlError, type Tx } from './dbTest'

const MIGRATION = 'drizzle/0012_friendships.sql'
const PATTERN_ERROR = 'Der Kontoname darf nur a–z, 0–9, . und _ enthalten (3–20 Zeichen).'

/** Spielt die Migration ein und legt Konten mit Namen an. Danach läuft alles als admin. */
async function setup(tx: Tx, handles: string[]): Promise<string[]> {
    await loadMigration(tx, MIGRATION)
    const ids: string[] = []
    for (const handle of handles) {
        const id = await makeUser(tx)
        await asUser(tx, id)
        await tx`select set_my_handle(${handle})`
        ids.push(id)
    }
    await asAdmin(tx)
    return ids
}

async function state(tx: Tx, userId: string): Promise<FriendState> {
    await asUser(tx, userId)
    const [row] = await tx<{ s: FriendState }[]>`select get_friend_state() as s`
    return row.s
}

async function send(tx: Tx, from: string, handle: string): Promise<FriendState> {
    await asUser(tx, from)
    const [row] = await tx<{ s: FriendState }[]>`select send_friend_request(${handle}) as s`
    return row.s
}

async function respond(tx: Tx, from: string, requestId: string, accept: boolean): Promise<FriendState> {
    await asUser(tx, from)
    const [row] = await tx<{ s: FriendState }[]>`select respond_friend_request(${requestId}::uuid, ${accept}) as s`
    return row.s
}

describe('Kontoname', () => {
    dbTest("set_my_handle(' Lena ') gibt 'lena' zurück", async (tx) => {
        await loadMigration(tx, MIGRATION)
        const a = await makeUser(tx)
        await asUser(tx, a)
        const [row] = await tx<{ h: string }[]>`select set_my_handle(' Lena ') as h`
        expect(row.h).toBe('lena')
        expect((await state(tx, a)).handle).toBe('lena')
    })

    dbTest('ein zweites Konto mit LENA scheitert (Groß-/Kleinschreibung zählt nicht)', async (tx) => {
        const [, b] = await setup(tx, ['lena', 'anton'])
        await asUser(tx, b)
        expect(await sqlError(tx, (sp) => sp`select set_my_handle('LENA')`)).toBe('Dieser Kontoname ist schon vergeben.')
    })

    dbTest('das eigene Konto darf den eigenen Namen erneut setzen oder ändern', async (tx) => {
        const [a] = await setup(tx, ['lena'])
        await asUser(tx, a)
        const [same] = await tx<{ h: string }[]>`select set_my_handle('Lena') as h`
        expect(same.h).toBe('lena')
        const [changed] = await tx<{ h: string }[]>`select set_my_handle('lena.neu') as h`
        expect(changed.h).toBe('lena.neu')
        expect((await state(tx, a)).handle).toBe('lena.neu')
    })

    for (const bad of ['ab', 'a'.repeat(21), 'le na', 'lena!', 'ä-name', '', '   ']) {
        dbTest(`ungültiger Name ${JSON.stringify(bad)} scheitert mit der Musterregel-Meldung`, async (tx) => {
            await loadMigration(tx, MIGRATION)
            const a = await makeUser(tx)
            await asUser(tx, a)
            expect(await sqlError(tx, (sp) => sp`select set_my_handle(${bad})`)).toBe(PATTERN_ERROR)
        })
    }

    dbTest('ohne Anmeldung (anon) ist set_my_handle nicht ausführbar', async (tx) => {
        await loadMigration(tx, MIGRATION)
        await asAnon(tx)
        expect(await sqlError(tx, (sp) => sp`select set_my_handle('lena')`)).toMatch(/permission denied/)
    })
})

describe('Anfragen', () => {
    dbTest('A schickt an lena, B sieht genau eine eingehende Anfrage von anton', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        expect(sent.outgoing?.handle).toBe('lena')
        expect(sent.friend).toBeNull()
        const bs = await state(tx, b)
        expect(bs.incoming).toHaveLength(1)
        expect(bs.incoming[0].handle).toBe('anton')
        expect(bs.incoming[0].id).toBe(sent.outgoing?.id)
        expect(bs.outgoing).toBeNull()
        expect(bs.unseenShares).toBe(0)
    })

    dbTest('get_friend_state hat genau die Form von FriendState', async (tx) => {
        const [a] = await setup(tx, ['anton'])
        expect(await state(tx, a)).toEqual({ handle: 'anton', friend: null, outgoing: null, incoming: [], unseenShares: 0 })
    })

    dbTest('die Suche braucht den exakten Namen, ignoriert aber Großbuchstaben und Leerzeichen', async (tx) => {
        const [a] = await setup(tx, ['anton', 'lena'])
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('len')`)).toBe('Kein Konto mit diesem Namen gefunden.')
        const s = await send(tx, a, ' LENA ')
        expect(s.outgoing?.handle).toBe('lena')
    })

    dbTest('B nimmt an, danach haben beide friend.handle und keine offenen Anfragen', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        const accepted = await respond(tx, b, sent.outgoing!.id, true)
        expect(accepted.friend).toEqual({ handle: 'anton' })
        expect(accepted.incoming).toEqual([])
        const as = await state(tx, a)
        expect(as.friend).toEqual({ handle: 'lena' })
        expect(as.outgoing).toBeNull()
        expect(as.incoming).toEqual([])
        const bs = await state(tx, b)
        expect(bs.friend).toEqual({ handle: 'anton' })
        expect(bs.outgoing).toBeNull()
        expect(bs.incoming).toEqual([])
        await asAdmin(tx)
        const rows = await tx`select status, responded_at from friendships`
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('accepted')
        expect(rows[0].responded_at).not.toBeNull()
    })

    dbTest('C schickt an A und bekommt "anton ist schon mit jemandem verbunden."', async (tx) => {
        const [a, b, c] = await setup(tx, ['anton', 'lena', 'carla'])
        const sent = await send(tx, a, 'lena')
        await respond(tx, b, sent.outgoing!.id, true)
        await asUser(tx, c)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('anton')`)).toBe('anton ist schon mit jemandem verbunden.')
    })

    dbTest('wer selbst verbunden ist, bekommt "Du bist schon mit jemandem verbunden."', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena', 'carla'])
        const sent = await send(tx, a, 'lena')
        await respond(tx, b, sent.outgoing!.id, true)
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('carla')`)).toBe('Du bist schon mit jemandem verbunden.')
    })

    dbTest('A schickt an sich selbst und bekommt "Das bist du selbst."', async (tx) => {
        const [a] = await setup(tx, ['anton'])
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('Anton')`)).toBe('Das bist du selbst.')
    })

    dbTest('ohne eigenen Namen kann man keine Anfrage schicken', async (tx) => {
        await setup(tx, ['lena'])
        const noName = await makeUser(tx)
        await asUser(tx, noName)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('lena')`)).toBe('Gib dir zuerst einen eigenen Kontonamen.')
    })

    dbTest('die zweite ausgehende Anfrage scheitert mit "Du hast schon eine offene Anfrage."', async (tx) => {
        const [a] = await setup(tx, ['anton', 'lena', 'carla'])
        await send(tx, a, 'lena')
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('carla')`)).toBe('Du hast schon eine offene Anfrage.')
        expect(await sqlError(tx, (sp) => sp`select send_friend_request('lena')`)).toBe('Du hast schon eine offene Anfrage.')
    })

    dbTest('mehrere eingehende Anfragen sind erlaubt', async (tx) => {
        const [a, b, c] = await setup(tx, ['anton', 'lena', 'carla'])
        await send(tx, b, 'anton')
        await send(tx, c, 'anton')
        const as = await state(tx, a)
        // now() ist in einer Transaktion überall gleich, die Reihenfolge ist hier also nicht festgelegt.
        expect(as.incoming.map((i) => i.handle).sort()).toEqual(['carla', 'lena'])
    })

    dbTest('schicken sich A und B gegenseitig eine Anfrage, ist die Freundschaft automatisch angenommen', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        await send(tx, a, 'lena')
        const s = await send(tx, b, 'anton')
        expect(s.friend).toEqual({ handle: 'anton' })
        expect(s.incoming).toEqual([])
        expect(s.outgoing).toBeNull()
        expect((await state(tx, a)).friend).toEqual({ handle: 'lena' })
        await asAdmin(tx)
        const rows = await tx`select status from friendships`
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('accepted')
    })

    dbTest('Annehmen löscht alle anderen offenen Anfragen beider Personen', async (tx) => {
        const [a, b, c, d] = await setup(tx, ['anton', 'lena', 'carla', 'dora'])
        const toB = await send(tx, a, 'lena') // A -> B (wird angenommen)
        await send(tx, c, 'anton') // C -> A (eingehend bei A)
        await send(tx, d, 'lena') // D -> B (eingehend bei B)
        await asAdmin(tx)
        await respond(tx, b, toB.outgoing!.id, true)
        await asAdmin(tx)
        const rows = await tx`select status from friendships`
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('accepted')
        expect((await state(tx, c)).outgoing).toBeNull()
        expect((await state(tx, d)).outgoing).toBeNull()
        expect((await state(tx, a)).incoming).toEqual([])
        expect((await state(tx, b)).incoming).toEqual([])
    })

    dbTest('Annehmen löscht auch die eigene ausgehende Anfrage der annehmenden Person', async (tx) => {
        const [a, b, c] = await setup(tx, ['anton', 'lena', 'carla'])
        const toB = await send(tx, a, 'lena') // A -> B
        await send(tx, b, 'carla') // B -> C (B hat eine eigene ausgehende)
        await respond(tx, b, toB.outgoing!.id, true)
        expect((await state(tx, c)).incoming).toEqual([])
        expect((await state(tx, b)).outgoing).toBeNull()
        expect((await state(tx, b)).friend).toEqual({ handle: 'anton' })
    })

    dbTest('Ablehnen löscht die Anfrage', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        const declined = await respond(tx, b, sent.outgoing!.id, false)
        expect(declined.incoming).toEqual([])
        expect(declined.friend).toBeNull()
        expect((await state(tx, a)).outgoing).toBeNull()
        await asAdmin(tx)
        expect(await tx`select 1 from friendships`).toHaveLength(0)
    })

    dbTest('nur die angefragte Person darf antworten', async (tx) => {
        const [a, b, c] = await setup(tx, ['anton', 'lena', 'carla'])
        const sent = await send(tx, a, 'lena')
        const id = sent.outgoing!.id
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select respond_friend_request(${id}::uuid, true)`)).toBe('Anfrage nicht gefunden.')
        await asUser(tx, c)
        expect(await sqlError(tx, (sp) => sp`select respond_friend_request(${id}::uuid, false)`)).toBe('Anfrage nicht gefunden.')
        expect((await state(tx, b)).incoming).toHaveLength(1)
    })

    dbTest('cancel_friend_request löscht die eigene ausgehende Anfrage', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        await send(tx, a, 'lena')
        await asUser(tx, a)
        const [row] = await tx<{ s: FriendState }[]>`select cancel_friend_request() as s`
        expect(row.s.outgoing).toBeNull()
        expect((await state(tx, b)).incoming).toEqual([])
    })

    dbTest('end_friendship löscht die angenommene Freundschaft für beide', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        await respond(tx, b, sent.outgoing!.id, true)
        await asUser(tx, b)
        const [row] = await tx<{ s: FriendState }[]>`select end_friendship() as s`
        expect(row.s.friend).toBeNull()
        expect((await state(tx, a)).friend).toBeNull()
        await asAdmin(tx)
        expect(await tx`select 1 from friendships`).toHaveLength(0)
    })
})

describe('Rechte', () => {
    dbTest('C sieht per select * from friendships keine Zeile von A und B', async (tx) => {
        const [a, b, c] = await setup(tx, ['anton', 'lena', 'carla'])
        const sent = await send(tx, a, 'lena')
        await asUser(tx, c)
        expect(await tx`select * from friendships`).toHaveLength(0)
        await asUser(tx, b)
        expect(await tx`select * from friendships`).toHaveLength(1)
        await respond(tx, b, sent.outgoing!.id, true)
        await asUser(tx, a)
        expect(await tx`select * from friendships`).toHaveLength(1)
        await asUser(tx, c)
        expect(await tx`select * from friendships`).toHaveLength(0)
    })

    dbTest('profiles: jeder sieht nur die eigene Zeile', async (tx) => {
        const [, , c] = await setup(tx, ['anton', 'lena', 'carla'])
        await asUser(tx, c)
        const rows = await tx<{ user_id: string; handle: string }[]>`select user_id, handle from profiles`
        expect(rows).toHaveLength(1)
        expect(rows[0].handle).toBe('carla')
    })

    dbTest('C kann nicht direkt schreiben (permission denied)', async (tx) => {
        const [a, b, c] = await setup(tx, ['anton', 'lena', 'carla'])
        await asUser(tx, c)
        expect(await sqlError(tx, (sp) => sp`insert into friendships (requester_id, addressee_id, status) values (${c}, ${a}, 'accepted')`)).toMatch(/permission denied/)
        expect(await sqlError(tx, (sp) => sp`update friendships set status = 'accepted'`)).toMatch(/permission denied/)
        expect(await sqlError(tx, (sp) => sp`delete from friendships`)).toMatch(/permission denied/)
        expect(await sqlError(tx, (sp) => sp`insert into profiles (user_id, handle) values (${b}, 'fremd')`)).toMatch(/permission denied/)
        expect(await sqlError(tx, (sp) => sp`update profiles set handle = 'neu'`)).toMatch(/permission denied/)
    })

    dbTest('anon darf die Funktionen nicht ausführen, authenticated schon', async (tx) => {
        await loadMigration(tx, MIGRATION)
        const rows = await tx<{ fn: string; anon: boolean; auth: boolean }[]>`
            select p.proname as fn,
                   has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                   has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('set_my_handle', 'get_friend_state', 'send_friend_request', 'cancel_friend_request', 'respond_friend_request', 'end_friendship')`
        expect(rows).toHaveLength(6)
        for (const r of rows) {
            expect(r.anon, r.fn).toBe(false)
            expect(r.auth, r.fn).toBe(true)
        }
    })

    dbTest('interne Hilfsfunktionen sind für authenticated nicht ausführbar', async (tx) => {
        const [a] = await setup(tx, ['anton'])
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select friend_state_for(${a}::uuid)`)).toMatch(/permission denied/)
    })
})

describe('Name und Freundschaft', () => {
    dbTest('set_my_handle scheitert, solange die Freundschaft angenommen ist', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        await respond(tx, b, sent.outgoing!.id, true)
        await asUser(tx, a)
        expect(await sqlError(tx, (sp) => sp`select set_my_handle('anton2')`)).toBe('Solange du verbunden bist, kannst du den Namen nicht ändern.')
        await asUser(tx, b)
        expect(await sqlError(tx, (sp) => sp`select set_my_handle('lena2')`)).toBe('Solange du verbunden bist, kannst du den Namen nicht ändern.')
    })

    dbTest('nach end_friendship kann der Name wieder geändert werden', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        await respond(tx, b, sent.outgoing!.id, true)
        await asUser(tx, a)
        await tx`select end_friendship()`
        const [row] = await tx<{ h: string }[]>`select set_my_handle('anton2') as h`
        expect(row.h).toBe('anton2')
    })

    dbTest('ohne auth.uid() melden die Funktionen "Nicht angemeldet."', async (tx) => {
        await loadMigration(tx, MIGRATION)
        await tx.unsafe('set local role authenticated')
        await tx`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`
        expect(await sqlError(tx, (sp) => sp`select get_friend_state()`)).toBe('Nicht angemeldet.')
    })

    dbTest('Konto löschen entfernt Profil und Freundschaft (ON DELETE CASCADE)', async (tx) => {
        const [a, b] = await setup(tx, ['anton', 'lena'])
        const sent = await send(tx, a, 'lena')
        await respond(tx, b, sent.outgoing!.id, true)
        await asAdmin(tx)
        await tx`delete from auth.users where id = ${a}`
        expect(await tx`select 1 from friendships`).toHaveLength(0)
        expect(await tx`select 1 from profiles where user_id = ${a}`).toHaveLength(0)
        expect((await state(tx, b)).friend).toBeNull()
    })
})
