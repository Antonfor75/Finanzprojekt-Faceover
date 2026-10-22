import { describe, expect } from 'vitest'
import type { FriendState, ShareItem } from '@/utils/sharing/types'
import { asAdmin, asUser, dbTest, ensureMigration, makeUser, sqlError, type Tx } from './dbTest'

const NOT_SHAREABLE = 'Diese Buchung kann nicht geteilt werden.'
const TOO_MUCH = 'Die Artikel des Partners ergeben mehr als den Gesamtbetrag.'
const BAD_ITEMS = 'Ungültige Artikelliste.'

type World = {
    a: string // anton (Ersteller)
    b: string // lena (Partner)
    c: string // carla (Fremde)
    expenseId: number // A's REWE-Ausgabe, 19,48
    itemIds: number[] // A's 8 Artikel (receipt_items.id), Reihenfolge wie ITEMS
}

// 8 Artikel, Summe 19,48. Die ersten vier gehören im Artikel-Test dem Partner (9,52), die übrigen A (9,96).
const ITEMS: { name: string; total: number; owner: 'creator' | 'partner' }[] = [
    { name: 'BROT', total: 3.49, owner: 'partner' },
    { name: 'KAESE', total: 2.79, owner: 'partner' },
    { name: 'JOGHURT', total: 1.65, owner: 'partner' },
    { name: 'NUDELN', total: 1.59, owner: 'partner' },
    { name: 'TOMATENSOSSE', total: 0.99, owner: 'creator' },
    { name: 'MILCH', total: 1.29, owner: 'creator' },
    { name: 'BANANEN', total: 2.1, owner: 'creator' },
    { name: 'KAFFEE', total: 5.58, owner: 'creator' },
]

async function insertExpense(tx: Tx, userId: string, fields: { amount: number; category?: string; account_id?: number | null; transfer_id?: string | null; description?: string }): Promise<number> {
    await asAdmin(tx)
    const [row] = await tx<{ id: number }[]>`
        insert into expenses (user_id, description, amount, expense_date, category, account_id, transfer_id)
        values (${userId}::uuid, ${fields.description ?? 'REWE'}, ${fields.amount}::numeric, '2026-10-20', ${fields.category ?? 'Lebensmittel'}, ${fields.account_id ?? null}::integer, ${fields.transfer_id ?? null}::uuid)
        returning id`
    return row.id
}

/** Lädt 0012 + 0013, legt anton/lena (befreundet) und carla an; A hat die REWE-Ausgabe mit 8 Artikeln. */
async function setup(tx: Tx, opts: { friends?: boolean } = {}): Promise<World> {
    // Auf der Live-Datenbank sind beide Migrationen schon eingespielt: dann nicht erneut laden (ALTER TABLE-Sperren).
    await ensureMigration(tx, 'drizzle/0012_friendships.sql', 'public.friendships')
    await ensureMigration(tx, 'drizzle/0013_shared_purchases.sql', 'public.shared_purchases')
    const [a, b, c] = [await makeUser(tx), await makeUser(tx), await makeUser(tx)]
    for (const [id, handle] of [[a, 'anton'], [b, 'lena'], [c, 'carla']] as const) {
        await asUser(tx, id)
        await tx`select set_my_handle(${handle})`
    }
    if (opts.friends !== false) {
        await asUser(tx, a)
        const [sent] = await tx<{ s: FriendState }[]>`select send_friend_request('lena') as s`
        await asUser(tx, b)
        await tx`select respond_friend_request(${sent.s.outgoing!.id}::uuid, true)`
    }
    const expenseId = await insertExpense(tx, a, { amount: 19.48 })
    const itemIds: number[] = []
    for (const it of ITEMS) {
        const [row] = await tx<{ id: number }[]>`
            insert into receipt_items (user_id, expense_id, name_raw, quantity, total_price, source)
            values (${a}::uuid, ${expenseId}::integer, ${it.name}, 1, ${it.total}::numeric, 'rewe') returning id`
        itemIds.push(row.id)
    }
    return { a, b, c, expenseId, itemIds }
}

type Exp = { id: number; amount: string; share_note: string | null; share_total: string | null; share_mode: string | null; shared_purchase_id: string | null; user_id: string; description: string; category: string | null; expense_date: string | null }

async function expensesOf(tx: Tx, userId: string): Promise<Exp[]> {
    await asAdmin(tx)
    return tx<Exp[]>`select id, amount::text, share_note, share_total::text, share_mode, shared_purchase_id, user_id, description, category, expense_date from expenses where user_id = ${userId}::uuid order by id`
}

async function expense(tx: Tx, id: number): Promise<Exp | undefined> {
    await asAdmin(tx)
    const rows = await tx<Exp[]>`select id, amount::text, share_note, share_total::text, share_mode, shared_purchase_id, user_id, description, category, expense_date from expenses where id = ${id}::integer`
    return rows[0]
}

async function save(tx: Tx, uid: string, expenseId: number, mode: string, percent: number | null, amount: number | null, items: ShareItem[] | null): Promise<string> {
    await asUser(tx, uid)
    const [row] = await tx<{ id: string }[]>`
        select save_share(${expenseId}::integer, ${mode}::text, ${percent}::numeric, ${amount}::numeric, ${items ? JSON.stringify(items) : null}::text::jsonb) as id`
    await asAdmin(tx) // danach lesen die Tests als Admin (RLS umgangen)
    return row.id
}

async function unseen(tx: Tx, uid: string): Promise<number> {
    await asUser(tx, uid)
    const [row] = await tx<{ s: FriendState }[]>`select get_friend_state() as s`
    return row.s.unseenShares
}

function shareItems(w: World, overrides: Partial<Record<number, 'creator' | 'partner'>> = {}): ShareItem[] {
    return ITEMS.map((it, i) => ({
        key: String(w.itemIds[i]),
        name_raw: it.name,
        quantity: 1,
        unit: null,
        unit_price: null,
        total_price: it.total,
        owner: overrides[i] ?? it.owner,
    }))
}

describe('save_share', () => {
    dbTest('Prozent: 50 % ergibt A 9,74, B 9,74 mit Hinweistexten', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        const a = await expense(tx, w.expenseId)
        expect(Number(a!.amount)).toBe(9.74)
        expect(a!.share_note).toBe('Geteilt mit lena')
        expect(Number(a!.share_total)).toBe(19.48)
        expect(a!.share_mode).toBe('percent')
        expect(a!.shared_purchase_id).toBe(id)
        const bRows = await expensesOf(tx, w.b)
        expect(bRows).toHaveLength(1)
        expect(Number(bRows[0].amount)).toBe(9.74)
        expect(bRows[0].share_note).toBe('Von anton geteilt')
        expect(Number(bRows[0].share_total)).toBe(19.48)
        expect(bRows[0].share_mode).toBe('percent')
        expect(bRows[0].shared_purchase_id).toBe(id)
        // gleiche Beschreibung, Datum und Kategorie
        expect([bRows[0].description, bRows[0].expense_date, bRows[0].category]).toEqual(['REWE', '2026-10-20', 'Lebensmittel'])
        const [sp] = await tx<{ creator_expense_id: number; partner_expense_id: number; total: string; partner_amount: string; mode: string; partner_percent: string; updated_by: string }[]>`
            select creator_expense_id, partner_expense_id, total::text, partner_amount::text, mode, partner_percent::text, updated_by from shared_purchases where id = ${id}::uuid`
        expect(sp.creator_expense_id).toBe(w.expenseId)
        expect(sp.partner_expense_id).toBe(bRows[0].id)
        expect(Number(sp.total)).toBe(19.48)
        expect(Number(sp.partner_amount)).toBe(9.74)
        expect(Number(sp.partner_percent)).toBe(50)
        expect(sp.updated_by).toBe(w.a)
    })

    dbTest('Prozent rundet den Partner-Anteil, A bekommt den Rest (33,33 % von 19,48)', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'percent', 33.33, null, null)
        const [b] = await expensesOf(tx, w.b)
        expect(Number(b.amount)).toBe(6.49) // round(1948 * 33.33 / 100) = 649
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(12.99)
    })

    dbTest('Betrag: 7,00 Partner-Anteil', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'amount', null, 7, null)
        const [b] = await expensesOf(tx, w.b)
        expect(Number(b.amount)).toBe(7)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(12.48)
    })

    dbTest('Artikel: Partner-Summe 9,52 ergibt A 9,96 und B 9,52, B hat 4 Kopien, A 4 Artikel weg', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(9.96)
        const [b] = await expensesOf(tx, w.b)
        expect(Number(b.amount)).toBe(9.52)
        expect(b.share_mode).toBe('items')
        const copies = await tx<{ name_raw: string; total_price: string; source: string; user_id: string; expense_id: number; product_id: number | null; shared_purchase_id: string; shared_away: boolean }[]>`
            select name_raw, total_price::text, source, user_id, expense_id, product_id, shared_purchase_id, shared_away from receipt_items where user_id = ${w.b}::uuid order by id`
        expect(copies).toHaveLength(4)
        expect(copies.map((c) => c.name_raw)).toEqual(['BROT', 'KAESE', 'JOGHURT', 'NUDELN'])
        for (const c of copies) {
            expect(c.source).toBe('shared')
            expect(c.expense_id).toBe(b.id)
            expect(c.product_id).toBeNull()
            expect(c.shared_purchase_id).toBe(id)
            expect(c.shared_away).toBe(false)
        }
        const away = await tx<{ name_raw: string; shared_purchase_id: string | null }[]>`
            select name_raw, shared_purchase_id from receipt_items where user_id = ${w.a}::uuid and shared_away order by id`
        expect(away.map((r) => r.name_raw)).toEqual(['BROT', 'KAESE', 'JOGHURT', 'NUDELN'])
        for (const r of away) expect(r.shared_purchase_id).toBe(id)
        const [mine] = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.a}::uuid and not shared_away`
        expect(mine.n).toBe(4)
        // die Artikelliste ist in der Teilung gespeichert (nur die ShareItem-Schlüssel)
        const [sp] = await tx<{ items: ShareItem[] }[]>`select items from shared_purchases where id = ${id}::uuid`
        expect(sp.items).toHaveLength(8)
        expect(Object.keys(sp.items[0]).sort()).toEqual(['key', 'name_raw', 'owner', 'quantity', 'total_price', 'unit', 'unit_price'])
    })

    dbTest('Artikel: erneutes Speichern ersetzt die Kopien und setzt shared_away neu', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        // jetzt gehört nur noch KAFFEE (5,58) dem Partner
        const only = shareItems(w, { 0: 'creator', 1: 'creator', 2: 'creator', 3: 'creator', 7: 'partner' })
        await save(tx, w.a, w.expenseId, 'items', null, null, only)
        const [b] = await expensesOf(tx, w.b)
        expect(Number(b.amount)).toBe(5.58)
        const copies = await tx<{ name_raw: string }[]>`select name_raw from receipt_items where user_id = ${w.b}::uuid`
        expect(copies.map((c) => c.name_raw)).toEqual(['KAFFEE'])
        const away = await tx<{ name_raw: string }[]>`select name_raw from receipt_items where user_id = ${w.a}::uuid and shared_away`
        expect(away.map((c) => c.name_raw)).toEqual(['KAFFEE'])
    })

    dbTest("Schlüssel 'local:-5' mit owner partner: Kopie bei B, bei A wird nichts geändert", async (tx) => {
        const w = await setup(tx)
        const items: ShareItem[] = [
            { key: 'local:-5', name_raw: 'PFAND', quantity: 1, unit: null, unit_price: null, total_price: 3, owner: 'partner' },
            { key: String(w.itemIds[0]), name_raw: 'BROT', quantity: 1, unit: null, unit_price: null, total_price: 3.49, owner: 'creator' },
        ]
        await save(tx, w.a, w.expenseId, 'items', null, null, items)
        const copies = await tx<{ name_raw: string; total_price: string }[]>`select name_raw, total_price::text from receipt_items where user_id = ${w.b}::uuid`
        expect(copies).toHaveLength(1)
        expect(copies[0].name_raw).toBe('PFAND')
        const [n] = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.a}::uuid and (shared_away or shared_purchase_id is not null) and name_raw <> 'BROT'`
        expect(n.n).toBe(0)
        const [total] = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.a}::uuid`
        expect(total.n).toBe(8)
        expect(Number((await expensesOf(tx, w.b))[0].amount)).toBe(3)
    })

    dbTest('Artikel-Schlüssel fremder Ausgaben und Konten werden nie verändert', async (tx) => {
        const w = await setup(tx)
        // Artikel von C und ein Artikel von A in einer anderen Ausgabe
        const cExp = await insertExpense(tx, w.c, { amount: 5 })
        const [cItem] = await tx<{ id: number }[]>`insert into receipt_items (user_id, expense_id, name_raw, total_price, source) values (${w.c}::uuid, ${cExp}::integer, 'FREMD', 5, 'rewe') returning id`
        const otherExp = await insertExpense(tx, w.a, { amount: 4 })
        const [aOther] = await tx<{ id: number }[]>`insert into receipt_items (user_id, expense_id, name_raw, total_price, source) values (${w.a}::uuid, ${otherExp}::integer, 'ANDERE', 4, 'rewe') returning id`
        const items: ShareItem[] = [
            { key: String(cItem.id), name_raw: 'FREMD', quantity: 1, unit: null, unit_price: null, total_price: 1, owner: 'partner' },
            { key: String(aOther.id), name_raw: 'ANDERE', quantity: 1, unit: null, unit_price: null, total_price: 1, owner: 'partner' },
        ]
        await save(tx, w.a, w.expenseId, 'items', null, null, items)
        const rows = await tx<{ name_raw: string; shared_away: boolean; shared_purchase_id: string | null }[]>`select name_raw, shared_away, shared_purchase_id from receipt_items where name_raw in ('FREMD', 'ANDERE') and source = 'rewe'`
        expect(rows).toHaveLength(2)
        for (const r of rows) {
            expect(r.shared_away).toBe(false)
            expect(r.shared_purchase_id).toBeNull()
        }
    })

    dbTest('Partner-Artikel mit Summe 25,00 ergeben "mehr als den Gesamtbetrag"', async (tx) => {
        const w = await setup(tx)
        const items: ShareItem[] = [{ key: 'local:-1', name_raw: 'TEUER', quantity: 1, unit: null, unit_price: null, total_price: 25, owner: 'partner' }]
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'items', null, null, ${JSON.stringify(items)}::text::jsonb)`)).toBe(TOO_MUCH)
        // nichts angelegt
        expect(await expensesOf(tx, w.b)).toHaveLength(0)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(19.48)
    })

    dbTest('Prozent über 100, negativer Betrag und Betrag über dem Gesamtbetrag scheitern mit derselben Meldung', async (tx) => {
        const w = await setup(tx)
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', 101::numeric, null, null)`)).toBe(TOO_MUCH)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', -1::numeric, null, null)`)).toBe(TOO_MUCH)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'amount', null, 19.49::numeric, null)`)).toBe(TOO_MUCH)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'amount', null, -0.01::numeric, null)`)).toBe(TOO_MUCH)
    })

    dbTest('Grenzen 0 % und 100 % sind erlaubt', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'percent', 100, null, null)
        expect(Number((await expensesOf(tx, w.b))[0].amount)).toBe(19.48)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(0)
        await save(tx, w.a, w.expenseId, 'percent', 0, null, null)
        expect(Number((await expensesOf(tx, w.b))[0].amount)).toBe(0)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(19.48)
    })

    dbTest('ein Partner-Artikel mit -0,25 (Pfand) senkt den Partner-Anteil', async (tx) => {
        const w = await setup(tx)
        const items = shareItems(w) // Partner: 9,52
        items.push({ key: 'local:-2', name_raw: 'PFAND', quantity: 1, unit: null, unit_price: null, total_price: -0.25, owner: 'partner' })
        await save(tx, w.a, w.expenseId, 'items', null, null, items)
        expect(Number((await expensesOf(tx, w.b))[0].amount)).toBe(9.27)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(10.21)
    })

    dbTest('ungültige Artikellisten scheitern mit "Ungültige Artikelliste."', async (tx) => {
        const w = await setup(tx)
        await asUser(tx, w.a)
        const valid = { key: 'local:-1', name_raw: 'X', quantity: 1, unit: null, unit_price: null, total_price: 1, owner: 'partner' }
        const cases: unknown[] = [
            null,
            {},
            'text',
            [1],
            [{ ...valid, owner: 'bob' }],
            [{ ...valid, total_price: '1' }],
            [{ ...valid, total_price: null }],
            [{ ...valid, key: 5 }],
            [{ ...valid, key: '' }],
            [{ ...valid, name_raw: null }],
            [{ ...valid, quantity: 'x' }],
            [{ ...valid, unit: 'liter' }],
            [{ ...valid, unit_price: 'x' }],
            [{ ...valid, key: undefined }],
            [valid, valid], // doppelter Schlüssel
        ]
        for (const c of cases) {
            const json = c === null ? null : JSON.stringify(c)
            expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'items', null, null, ${json}::text::jsonb)`), JSON.stringify(c)).toBe(BAD_ITEMS)
        }
    })

    dbTest('ungültiger Modus und fehlende Werte scheitern', async (tx) => {
        const w = await setup(tx)
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'foo', 50::numeric, null, null)`)).toBe('Ungültiger Teilungsmodus.')
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', null, null, null)`)).toBe('Ungültiger Anteil.')
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'amount', null, null, null)`)).toBe('Ungültiger Anteil.')
    })
})

describe('Ändern durch den Partner und Benachrichtigung', () => {
    dbTest('B ändert auf 30 %: A 13,64, B 5,84, updated_by B, A hat unseenShares = 1, danach 0', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        // A hat selbst gespeichert: für A nichts Neues; B sieht die neue Teilung
        expect(await unseen(tx, w.a)).toBe(0)
        expect(await unseen(tx, w.b)).toBe(1)
        const bExp = (await expensesOf(tx, w.b))[0]
        await asUser(tx, w.b)
        await tx`select mark_shares_seen()`
        expect(await unseen(tx, w.b)).toBe(0)

        const sameId = await save(tx, w.b, bExp.id, 'percent', 30, null, null)
        expect(sameId).toBe(id)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(13.64)
        expect(Number((await expense(tx, bExp.id))!.amount)).toBe(5.84)
        const [sp] = await tx<{ updated_by: string }[]>`select updated_by from shared_purchases where id = ${id}::uuid`
        expect(sp.updated_by).toBe(w.b)
        expect(await unseen(tx, w.a)).toBe(1)
        expect(await unseen(tx, w.b)).toBe(0) // eigene Änderung
        await asUser(tx, w.a)
        await tx`select mark_shares_seen()`
        expect(await unseen(tx, w.a)).toBe(0)
    })

    dbTest('B ändert nach Artikeln: Kopien bei B werden ersetzt, A-Artikel shared_away folgt', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        const bExp = (await expensesOf(tx, w.b))[0]
        // B nimmt zusätzlich TOMATENSOSSE (0,99): 10,51
        await save(tx, w.b, bExp.id, 'items', null, null, shareItems(w, { 4: 'partner' }))
        expect(Number((await expense(tx, bExp.id))!.amount)).toBe(10.51)
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(8.97)
        const copies = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.b}::uuid and source = 'shared'`
        expect(copies[0].n).toBe(5)
        const away = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.a}::uuid and shared_away`
        expect(away[0].n).toBe(5)
    })

    dbTest('zwei aufeinanderfolgende save_share von A, B, A: der Endstand entspricht dem letzten Aufruf', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        const bExp = (await expensesOf(tx, w.b))[0]
        await save(tx, w.b, bExp.id, 'percent', 30, null, null)
        await save(tx, w.a, w.expenseId, 'percent', 20, null, null)
        const a = await expense(tx, w.expenseId)
        const b = await expense(tx, bExp.id)
        expect(Number(a!.amount)).toBe(15.58)
        expect(Number(b!.amount)).toBe(3.9)
        expect(Number(a!.amount) + Number(b!.amount)).toBeCloseTo(19.48, 2)
        const [sp] = await tx<{ updated_by: string; partner_amount: string; partner_percent: string }[]>`select updated_by, partner_amount::text, partner_percent::text from shared_purchases where id = ${id}::uuid`
        expect(sp.updated_by).toBe(w.a)
        expect(Number(sp.partner_amount)).toBe(3.9)
        expect(Number(sp.partner_percent)).toBe(20)
        const [n] = await tx<{ n: number }[]>`select count(*)::int as n from expenses where shared_purchase_id = ${id}::uuid`
        expect(n.n).toBe(2)
    })

    dbTest('Beschreibung, Datum und Kategorie der Partner-Ausgabe bleiben nach dem Ändern gleich', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        await save(tx, w.a, w.expenseId, 'percent', 40, null, null)
        const [b] = await expensesOf(tx, w.b)
        expect([b.description, b.expense_date, b.category]).toEqual(['REWE', '2026-10-20', 'Lebensmittel'])
        expect(await expensesOf(tx, w.b)).toHaveLength(1)
    })

    dbTest('share_note nutzt den aktuellen Kontonamen beim Speichern', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        // Namen kann man nur ohne Freundschaft ändern; hier direkt als Admin (Test des Verhaltens beim nächsten Speichern)
        await asAdmin(tx)
        await tx`update profiles set handle = 'lena.neu' where user_id = ${w.b}::uuid`
        await save(tx, w.a, w.expenseId, 'percent', 40, null, null)
        expect((await expense(tx, w.expenseId))!.share_note).toBe('Geteilt mit lena.neu')
    })
})

describe('unshare und delete_shared', () => {
    dbTest('unshare: A-Ausgabe 19,48 ohne Hinweis, B-Ausgabe und B-Artikel weg, Teilung weg', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        const bExp = (await expensesOf(tx, w.b))[0]
        await asUser(tx, w.a)
        await tx`select unshare(${id}::uuid)`
        const a = await expense(tx, w.expenseId)
        expect(Number(a!.amount)).toBe(19.48)
        expect([a!.share_note, a!.share_total, a!.share_mode, a!.shared_purchase_id]).toEqual([null, null, null, null])
        expect(await expense(tx, bExp.id)).toBeUndefined()
        const [n] = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.b}::uuid`
        expect(n.n).toBe(0)
        const [away] = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id = ${w.a}::uuid and (shared_away or shared_purchase_id is not null)`
        expect(away.n).toBe(0)
        await asAdmin(tx)
        const [sp] = await tx<{ n: number }[]>`select count(*)::int as n from shared_purchases`
        expect(sp.n).toBe(0)
    })

    dbTest('unshare darf auch der Partner (B)', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        await asUser(tx, w.b)
        await tx`select unshare(${id}::uuid)`
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(19.48)
        expect(await expensesOf(tx, w.b)).toHaveLength(0)
    })

    dbTest('delete_shared: beide Ausgaben, alle Artikel und die Teilung sind weg', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        const bExp = (await expensesOf(tx, w.b))[0]
        await asUser(tx, w.b)
        await tx`select delete_shared(${id}::uuid)`
        expect(await expense(tx, w.expenseId)).toBeUndefined()
        expect(await expense(tx, bExp.id)).toBeUndefined()
        const [n] = await tx<{ n: number }[]>`select count(*)::int as n from receipt_items where user_id in (${w.a}::uuid, ${w.b}::uuid)`
        expect(n.n).toBe(0)
        const [sp] = await tx<{ n: number }[]>`select count(*)::int as n from shared_purchases`
        expect(sp.n).toBe(0)
    })

    dbTest('Fremde (C) können weder unshare noch delete_shared', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        await asUser(tx, w.c)
        expect(await sqlError(tx, (sp) => sp`select unshare(${id}::uuid)`)).toBe('Teilung nicht gefunden.')
        expect(await sqlError(tx, (sp) => sp`select delete_shared(${id}::uuid)`)).toBe('Teilung nicht gefunden.')
        expect(await sqlError(tx, (sp) => sp`select unshare(gen_random_uuid())`)).toBe('Teilung nicht gefunden.')
    })

    dbTest('ohne bestehende Verbindung (Freundschaftszeile gelöscht) scheitern save/unshare/delete_shared', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        await asAdmin(tx)
        await tx`delete from friendships`
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select unshare(${id}::uuid)`)).toBe('Ihr seid nicht mehr verbunden.')
        expect(await sqlError(tx, (sp) => sp`select delete_shared(${id}::uuid)`)).toBe('Ihr seid nicht mehr verbunden.')
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', 10::numeric, null, null)`)).toBe('Ihr seid nicht mehr verbunden.')
    })
})

describe('Fehlerfälle und Rechte', () => {
    dbTest('Teilen ohne Freund: "Du hast noch keinen Freund verknüpft."', async (tx) => {
        const w = await setup(tx, { friends: false })
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', 50::numeric, null, null)`)).toBe('Du hast noch keinen Freund verknüpft.')
    })

    dbTest('Ausgabe mit account_id: "Diese Buchung kann nicht geteilt werden."', async (tx) => {
        const w = await setup(tx)
        const id = await insertExpense(tx, w.a, { amount: 10, account_id: 7 })
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select save_share(${id}::integer, 'percent', 50::numeric, null, null)`)).toBe(NOT_SHAREABLE)
    })

    dbTest('weitere nicht teilbare Ausgaben: Konto:-Kategorie, transfer_id, Umbuchung, Manuelle Buchung, Betrag <= 0', async (tx) => {
        const w = await setup(tx)
        const ids = [
            await insertExpense(tx, w.a, { amount: 10, category: 'Konto: Urlaub' }),
            await insertExpense(tx, w.a, { amount: 10, transfer_id: '00000000-0000-0000-0000-0000000000aa' }),
            await insertExpense(tx, w.a, { amount: 10, category: 'Umbuchung' }),
            await insertExpense(tx, w.a, { amount: 10, category: 'Manuelle Buchung' }),
            await insertExpense(tx, w.a, { amount: -10 }),
            await insertExpense(tx, w.a, { amount: 0 }),
        ]
        await asUser(tx, w.a)
        for (const id of ids) {
            expect(await sqlError(tx, (sp) => sp`select save_share(${id}::integer, 'percent', 50::numeric, null, null)`), String(id)).toBe(NOT_SHAREABLE)
        }
    })

    dbTest('Ausgabe ohne Kategorie ist teilbar', async (tx) => {
        const w = await setup(tx)
        await asAdmin(tx)
        const [row] = await tx<{ id: number }[]>`insert into expenses (user_id, description, amount, expense_date, category) values (${w.a}::uuid, 'Kiosk', 4, '2026-10-20', null) returning id`
        await save(tx, w.a, row.id, 'percent', 50, null, null)
        expect(Number((await expensesOf(tx, w.b))[0].amount)).toBe(2)
    })

    dbTest('C sieht keine shared_purchases von A und B; A und B sehen ihre Teilung', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        await asUser(tx, w.c)
        expect(await tx`select id from shared_purchases`).toHaveLength(0)
        await asUser(tx, w.a)
        expect(await tx`select id from shared_purchases`).toHaveLength(1)
        await asUser(tx, w.b)
        expect(await tx`select id from shared_purchases`).toHaveLength(1)
    })

    dbTest('save_share mit As Ausgaben-ID als C scheitert; auch mit As ID als B', async (tx) => {
        const w = await setup(tx)
        await asUser(tx, w.c)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', 50::numeric, null, null)`)).toBe('Ausgabe nicht gefunden.')
        expect(await sqlError(tx, (sp) => sp`select save_share(999999999::integer, 'percent', 50::numeric, null, null)`)).toBe('Ausgabe nicht gefunden.')
        // B darf As ungeteilte Ausgabe nicht teilen
        await asUser(tx, w.b)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', 50::numeric, null, null)`)).toBe('Ausgabe nicht gefunden.')
        expect(await expensesOf(tx, w.b)).toHaveLength(0)
    })

    dbTest('Ein manipulierter Verweis (fremde shared_purchase_id an eigener Ausgabe) erlaubt kein Ändern', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        // C bekommt (z. B. per Direktzugriff auf die eigene Zeile) einen Verweis auf eine fremde Teilung
        const cExp = await insertExpense(tx, w.c, { amount: 8 })
        await asAdmin(tx)
        await tx`update expenses set shared_purchase_id = ${id}::uuid where id = ${cExp}::integer`
        await asUser(tx, w.c)
        expect(await sqlError(tx, (sp) => sp`select save_share(${cExp}::integer, 'percent', 10::numeric, null, null)`)).toBe('Ausgabe nicht gefunden.')
        expect(Number((await expense(tx, w.expenseId))!.amount)).toBe(9.74)
    })

    dbTest('ohne Anmeldung (kein auth.uid()) scheitern alle Funktionen', async (tx) => {
        await setup(tx)
        await asAdmin(tx)
        await tx.unsafe('set local role authenticated')
        await tx`select set_config('request.jwt.claims', '', true)`
        expect(await sqlError(tx, (sp) => sp`select save_share(1::integer, 'percent', 50::numeric, null, null)`)).toBe('Nicht angemeldet.')
        expect(await sqlError(tx, (sp) => sp`select unshare(gen_random_uuid())`)).toBe('Nicht angemeldet.')
        expect(await sqlError(tx, (sp) => sp`select delete_shared(gen_random_uuid())`)).toBe('Nicht angemeldet.')
        expect(await sqlError(tx, (sp) => sp`select mark_shares_seen()`)).toBe('Nicht angemeldet.')
    })

    dbTest('Rechte: anon darf nichts ausführen, authenticated nur die öffentlichen; Direktschreiben ist verboten', async (tx) => {
        const w = await setup(tx)
        await asAdmin(tx)
        const rows = await tx<{ fn: string; anon: boolean; auth: boolean }[]>`
            select p.proname as fn,
                   has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                   has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('save_share', 'unshare', 'delete_shared', 'mark_shares_seen')`
        expect(rows).toHaveLength(4)
        for (const r of rows) {
            expect(r.anon, r.fn).toBe(false)
            expect(r.auth, r.fn).toBe(true)
        }
        // alle neuen und ersetzten Funktionen haben einen gehärteten search_path
        const [cfg] = await tx<{ n: number }[]>`
            select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('save_share', 'unshare', 'delete_shared', 'mark_shares_seen', 'end_friendship', 'friend_state_for', 'friend_lock', 'get_friend_state')
              and p.proconfig @> array['search_path=public, pg_temp']`
        expect(cfg.n).toBe(8)
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`insert into shared_purchases (creator_id, partner_id, creator_expense_id, partner_expense_id, total, mode, partner_amount) values (${w.a}::uuid, ${w.b}::uuid, 1, 2, 1, 'percent', 0)`)).toMatch(/permission denied/)
        expect(await sqlError(tx, (sp) => sp`update shared_purchases set total = 1`)).toMatch(/permission denied/)
        expect(await sqlError(tx, (sp) => sp`delete from shared_purchases`)).toMatch(/permission denied/)
    })
})

describe('Trennen und Konto löschen', () => {
    dbTest('end_friendship als B: beide Ausgaben bleiben, shared_purchase_id NULL, share_note gesetzt, Teilung weg', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        const bExp = (await expensesOf(tx, w.b))[0]
        await asUser(tx, w.b)
        await tx`select end_friendship()`
        const a = await expense(tx, w.expenseId)
        const b = await expense(tx, bExp.id)
        expect(a).toBeDefined()
        expect(b).toBeDefined()
        expect(a!.shared_purchase_id).toBeNull()
        expect(b!.shared_purchase_id).toBeNull()
        expect(a!.share_note).toBe('Geteilt mit lena')
        expect(b!.share_note).toBe('Von anton geteilt')
        expect(Number(a!.share_total)).toBe(19.48)
        expect(Number(b!.share_total)).toBe(19.48)
        expect(Number(a!.amount)).toBe(9.96)
        expect(Number(b!.amount)).toBe(9.52)
        const [sp] = await tx<{ n: number }[]>`select count(*)::int as n from shared_purchases`
        expect(sp.n).toBe(0)
        // Artikelkopien von B bleiben, aber ohne Verweis
        const copies = await tx<{ shared_purchase_id: string | null }[]>`select shared_purchase_id from receipt_items where user_id = ${w.b}::uuid`
        expect(copies).toHaveLength(4)
        for (const c of copies) expect(c.shared_purchase_id).toBeNull()
        // A's Artikel behalten shared_away (der Betrag von A blieb ja 9,96), aber ohne Verweis
        const away = await tx<{ shared_purchase_id: string | null }[]>`select shared_purchase_id from receipt_items where user_id = ${w.a}::uuid and shared_away`
        expect(away).toHaveLength(4)
        for (const r of away) expect(r.shared_purchase_id).toBeNull()
        // Danach ist keine Teilung mehr möglich; unseenShares ist 0
        expect(await unseen(tx, w.a)).toBe(0)
        await asUser(tx, w.a)
        expect(await sqlError(tx, (sp) => sp`select save_share(${w.expenseId}::integer, 'percent', 10::numeric, null, null)`)).toBe('Du hast noch keinen Freund verknüpft.')
    })

    dbTest('end_friendship ohne Teilungen funktioniert wie zuvor und liefert den Zustand', async (tx) => {
        const w = await setup(tx)
        await asUser(tx, w.a)
        const [row] = await tx<{ s: FriendState }[]>`select end_friendship() as s`
        expect(row.s.friend).toBeNull()
        expect(row.s.unseenShares).toBe(0)
        expect(row.s.handle).toBe('anton')
    })

    dbTest('Konto von A löschen: die Ausgabe von B bleibt, shared_purchase_id NULL', async (tx) => {
        const w = await setup(tx)
        const id = await save(tx, w.a, w.expenseId, 'items', null, null, shareItems(w))
        const bExp = (await expensesOf(tx, w.b))[0]
        await asAdmin(tx)
        await tx`delete from auth.users where id = ${w.a}::uuid`
        const b = await expense(tx, bExp.id)
        expect(b).toBeDefined()
        expect(b!.shared_purchase_id).toBeNull()
        expect(b!.share_note).toBe('Von anton geteilt')
        const [sp] = await tx<{ n: number }[]>`select count(*)::int as n from shared_purchases where id = ${id}::uuid`
        expect(sp.n).toBe(0)
        const copies = await tx<{ shared_purchase_id: string | null }[]>`select shared_purchase_id from receipt_items where user_id = ${w.b}::uuid`
        expect(copies).toHaveLength(4)
        for (const c of copies) expect(c.shared_purchase_id).toBeNull()
    })

    dbTest('Konto von B löschen: die Ausgabe von A bleibt mit shared_purchase_id NULL', async (tx) => {
        const w = await setup(tx)
        await save(tx, w.a, w.expenseId, 'percent', 50, null, null)
        await asAdmin(tx)
        await tx`delete from auth.users where id = ${w.b}::uuid`
        const a = await expense(tx, w.expenseId)
        expect(a!.shared_purchase_id).toBeNull()
        expect(a!.share_note).toBe('Geteilt mit lena')
    })
})
