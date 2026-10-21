import { describe, it, expect } from 'vitest'
import type { Expense, ReceiptItem } from '@/app/types'
import type { ShareItem, SharedPurchase } from '@/utils/sharing/types'
import {
    allToOwner, amountsFor, boardLayout, buildSaveInput, columnCents, deleteConfirmText, initialSplit, itemsForBoard,
    itemsMismatch, moveItem, parseEuroInput, roleIn, shareAction, shareActionLabel, shareItemsFromReceipt,
    shareSheetTitle, splitFromAmountInput, splitFromItems, splitFromPercent, splitFromViewPercent, swimClass, unshareConfirmText, viewPercent,
} from './shareSheetModel'

const exp = (over: Partial<Expense> = {}): Expense => ({
    id: 5,
    created_at: '2026-10-20T10:00:00Z',
    description: 'REWE',
    amount: 19.48,
    expense_date: '2026-10-20',
    category: 'Essen',
    account_id: null,
    transfer_id: null,
    ...over,
})

const sp = (over: Partial<SharedPurchase> = {}): SharedPurchase => ({
    id: 'sp1',
    creator_id: 'u1',
    partner_id: 'u2',
    creator_expense_id: 5,
    partner_expense_id: 9,
    description: 'REWE',
    expense_date: '2026-10-20',
    category: 'Essen',
    total: 19.48,
    mode: 'percent',
    partner_percent: 40,
    partner_amount: 7.79,
    items: [],
    updated_by: 'u1',
    updated_at: '2026-10-20T10:00:00Z',
    ...over,
})

const si = (key: string, price: number, owner: 'creator' | 'partner' = 'creator'): ShareItem => ({
    key, name_raw: `Artikel ${key}`, quantity: 1, unit: 'stk', unit_price: null, total_price: price, owner,
})

describe('shareAction: wann wird "Teilen" angeboten', () => {
    it('bietet Teilen bei einer normalen Ausgabe mit Freund an', () => {
        expect(shareAction(exp(), true)).toBe('share')
    })
    it('bietet ohne Freund nichts an', () => {
        expect(shareAction(exp(), false)).toBeNull()
        expect(shareAction(exp({ shared_purchase_id: 'sp1' }), false)).toBeNull()
    })
    it('bietet bei geteilter Ausgabe "Teilung ändern" an, auch wenn der eigene Anteil 0 ist', () => {
        expect(shareAction(exp({ shared_purchase_id: 'sp1', amount: 0 }), true)).toBe('change')
    })
    it('bietet genau die Fälle nicht an, die der Server ablehnt', () => {
        expect(shareAction(exp({ account_id: 3 }), true)).toBeNull()
        expect(shareAction(exp({ category: 'Konto: Urlaub' }), true)).toBeNull()
        expect(shareAction(exp({ transfer_id: 't1' }), true)).toBeNull()
        expect(shareAction(exp({ category: 'Umbuchung' }), true)).toBeNull()
        expect(shareAction(exp({ category: 'Manuelle Buchung' }), true)).toBeNull()
        expect(shareAction(exp({ amount: 0 }), true)).toBeNull()
        expect(shareAction(exp({ amount: -4 }), true)).toBeNull()
    })
    it('bietet eine noch nicht gespeicherte (optimistische) Ausgabe nicht an', () => {
        expect(shareAction(exp({ id: -1730000000000 }), true)).toBeNull()
    })
    it('rechnet den Betrag auch als Postgres-String richtig', () => {
        expect(shareAction(exp({ amount: '12.50' as unknown as number }), true)).toBe('share')
        expect(shareAction(exp({ amount: '0.00' as unknown as number }), true)).toBeNull()
    })
})

describe('Texte', () => {
    it('benennt Knopf und Titel', () => {
        expect(shareActionLabel('share')).toBe('Teilen')
        expect(shareActionLabel('change')).toBe('Teilung ändern')
        expect(shareSheetTitle('REWE', 'share')).toBe('REWE teilen')
        expect(shareSheetTitle('REWE', 'change')).toBe('REWE Teilung ändern')
    })
    it('fragt beim Aufheben und Löschen mit den richtigen Namen nach', () => {
        expect(unshareConfirmText('creator', 'lena')).toContain('bei dir')
        expect(unshareConfirmText('creator', 'lena')).toContain('bei lena verschwindet')
        expect(unshareConfirmText('partner', 'anton')).toContain('ganz bei anton')
        expect(unshareConfirmText('partner', 'anton')).toContain('bei dir verschwindet')
        expect(deleteConfirmText('lena')).toContain('bei dir und bei lena')
    })
})

describe('roleIn', () => {
    it('erkennt den creator an der eigenen Ausgabe', () => {
        expect(roleIn(exp({ id: 5 }), sp())).toBe('creator')
        expect(roleIn(exp({ id: 9 }), sp())).toBe('partner')
    })
    it('ist ohne Teilung der creator', () => {
        expect(roleIn(exp(), null)).toBe('creator')
    })
})

describe('Prozent und Beträge', () => {
    it('rechnet den Partner-Anteil in Cent gerundet, der Rest gehört dem creator', () => {
        const s = splitFromPercent(1948, 50)
        expect(s).toEqual({ mode: 'percent', partnerPercent: 50, partnerCents: 974 })
        expect(amountsFor(1948, s.partnerCents, 'creator')).toEqual({ meCents: 974, friendCents: 974 })
        const t = splitFromPercent(1285, 50)
        expect(t.partnerCents).toBe(643) // 642,5 gerundet
        expect(amountsFor(1285, t.partnerCents, 'creator')).toEqual({ meCents: 642, friendCents: 643 })
    })
    it('begrenzt Prozent auf 0 bis 100', () => {
        expect(splitFromPercent(1000, 130).partnerPercent).toBe(100)
        expect(splitFromPercent(1000, -5).partnerPercent).toBe(0)
    })
    it('der Balken zeigt immer den eigenen Anteil links (Partner gespiegelt)', () => {
        const s = splitFromPercent(2000, 40) // Partner trägt 40 %
        expect(viewPercent('creator', s)).toBe(60)
        expect(viewPercent('partner', s)).toBe(40)
        expect(splitFromViewPercent(2000, 'creator', 60)).toEqual(s)
        expect(splitFromViewPercent(2000, 'partner', 40)).toEqual(s)
    })
    it('amountsFor vertauscht die Seiten für den Partner', () => {
        expect(amountsFor(2000, 800, 'creator')).toEqual({ meCents: 1200, friendCents: 800 })
        expect(amountsFor(2000, 800, 'partner')).toEqual({ meCents: 800, friendCents: 1200 })
    })
})

describe('parseEuroInput (deutsche Eingabe)', () => {
    it('versteht Komma, Punkt, Tausender und Eurozeichen', () => {
        expect(parseEuroInput('3,50')).toBe(350)
        expect(parseEuroInput('3.5')).toBe(350)
        expect(parseEuroInput('1.234,50')).toBe(123450)
        expect(parseEuroInput('1.234')).toBe(123400)
        expect(parseEuroInput(' 7 € ')).toBe(700)
        expect(parseEuroInput('0,999')).toBe(100)
    })
    it('leer ist 0, Unsinn ist null', () => {
        expect(parseEuroInput('')).toBe(0)
        expect(parseEuroInput('abc')).toBeNull()
        expect(parseEuroInput('1,2,3')).toBeNull()
    })
})

describe('Betrag eingeben: das andere Feld rechnet den Rest', () => {
    const prev = splitFromPercent(1948, 50)
    it('Eingabe bei mir: der Freund bekommt den Rest (creator)', () => {
        const s = splitFromAmountInput(1948, 'creator', 'me', '12,00', prev)
        expect(s.mode).toBe('amount')
        expect(s.partnerCents).toBe(748)
        expect(amountsFor(1948, s.partnerCents, 'creator')).toEqual({ meCents: 1200, friendCents: 748 })
    })
    it('Eingabe beim Freund: gilt direkt als Partner-Anteil (creator)', () => {
        expect(splitFromAmountInput(1948, 'creator', 'friend', '5', prev).partnerCents).toBe(500)
    })
    it('Partner-Sicht: mein Feld ist der Partner-Anteil', () => {
        expect(splitFromAmountInput(1948, 'partner', 'me', '5', prev).partnerCents).toBe(500)
        expect(splitFromAmountInput(1948, 'partner', 'friend', '5', prev).partnerCents).toBe(1448)
    })
    it('begrenzt auf 0 bis Gesamtbetrag', () => {
        expect(splitFromAmountInput(1948, 'creator', 'me', '99', prev).partnerCents).toBe(0)
        expect(splitFromAmountInput(1948, 'creator', 'friend', '99', prev).partnerCents).toBe(1948)
    })
    it('setzt den Balken auf den passenden Prozentwert', () => {
        const s = splitFromAmountInput(2000, 'creator', 'friend', '5', prev)
        expect(s.partnerPercent).toBe(25)
    })
    it('lässt bei unlesbarer Eingabe den Stand unverändert', () => {
        expect(splitFromAmountInput(1948, 'creator', 'me', 'abc', prev)).toBe(prev)
    })
})

describe('initialSplit', () => {
    it('startet neu bei 50 / 50', () => {
        expect(initialSplit(exp(), null)).toEqual({ role: 'creator', totalCents: 1948, split: { mode: 'percent', partnerPercent: 50, partnerCents: 974 } })
    })
    it('nimmt vor dem Laden den Gesamtbetrag einer schon geteilten Ausgabe aus share_total', () => {
        expect(initialSplit(exp({ shared_purchase_id: 'sp1', amount: 11.69, share_total: 19.48 }), null).totalCents).toBe(1948)
    })
    it('übernimmt den gespeicherten Prozentwert', () => {
        const r = initialSplit(exp({ shared_purchase_id: 'sp1', amount: 11.69 }), sp())
        expect(r.role).toBe('creator')
        expect(r.totalCents).toBe(1948)
        expect(r.split).toEqual({ mode: 'percent', partnerPercent: 40, partnerCents: 779 })
    })
    it('leitet bei Betrag und Artikeln den Prozentwert aus dem Partner-Anteil ab', () => {
        const amount = initialSplit(exp({ id: 9 }), sp({ mode: 'amount', partner_percent: null, partner_amount: 5 }))
        expect(amount.role).toBe('partner')
        expect(amount.split).toEqual({ mode: 'amount', partnerPercent: 26, partnerCents: 500 })
        const items = initialSplit(exp(), sp({ mode: 'items', partner_percent: null, partner_amount: 9.52 }))
        expect(items.split.mode).toBe('items')
        expect(items.split.partnerCents).toBe(952)
    })
})

describe('Artikel fürs Brett', () => {
    const ri = (id: number, price: number, over: Partial<ReceiptItem> = {}): ReceiptItem => ({
        id, expense_id: 5, name_raw: `A${id}`, quantity: '2' as unknown as number, unit: undefined, unit_price: '1.5' as unknown as number,
        total_price: price, source: 'manual', ...over,
    })
    it('macht aus Bon-Artikeln Brett-Artikel mit key = id, alle beim creator', () => {
        const items = shareItemsFromReceipt([ri(11, 2), ri(12, 3, { unit: 'kg', unit_price: null })])
        expect(items).toEqual([
            { key: '11', name_raw: 'A11', quantity: 2, unit: null, unit_price: 1.5, total_price: 2, owner: 'creator' },
            { key: '12', name_raw: 'A12', quantity: 2, unit: 'kg', unit_price: null, total_price: 3, owner: 'creator' },
        ])
    })
    it('lässt weggeteilte Artikel weg', () => {
        expect(shareItemsFromReceipt([ri(11, 2), ri(12, 3, { shared_away: true })]).map((i) => i.key)).toEqual(['11'])
    })
    it('nimmt bei bestehender Artikel-Teilung deren Liste, sonst die Bon-Artikel', () => {
        const fromShare = [si('11', 2, 'partner'), si('12', 3)]
        expect(itemsForBoard(sp({ mode: 'items', items: fromShare }), [ri(11, 2)])).toBe(fromShare)
        expect(itemsForBoard(sp({ mode: 'percent' }), [ri(11, 2)]).map((i) => i.key)).toEqual(['11'])
        expect(itemsForBoard(null, [ri(11, 2)]).map((i) => i.key)).toEqual(['11'])
        expect(itemsForBoard(sp({ mode: 'items', items: [] }), [])).toEqual([])
    })
})

describe('Brett: Spalten und Bewegung', () => {
    it('der creator hat sich links, der Partner sieht seine Spalte links', () => {
        expect(boardLayout('creator')).toEqual({ left: 'creator', right: 'partner' })
        expect(boardLayout('partner')).toEqual({ left: 'partner', right: 'creator' })
    })
    it('moveItem dreht den Besitzer und hängt den Artikel ans Ende', () => {
        const items = [si('1', 1), si('2', 2), si('3', 3)]
        const moved = moveItem(items, '1')!
        expect(moved.to).toBe('partner')
        expect(moved.items.map((i) => i.key)).toEqual(['2', '3', '1'])
        expect(moved.items[2].owner).toBe('partner')
        expect(items[0].owner).toBe('creator') // Eingabe bleibt unverändert
    })
    it('moveItem findet zurück und ignoriert unbekannte Schlüssel', () => {
        const items = [si('1', 1, 'partner'), si('2', 2)]
        expect(moveItem(items, '1')!.to).toBe('creator')
        expect(moveItem(items, 'x')).toBeNull()
    })
    it('schwimmt zur Zielspalte: rechts = item-swim-r, links = item-swim-l', () => {
        expect(swimClass('partner', 'creator')).toBe('item-swim-r')
        expect(swimClass('creator', 'creator')).toBe('item-swim-l')
        // gespiegelt: der Partner hat seine Spalte links
        expect(swimClass('partner', 'partner')).toBe('item-swim-l')
        expect(swimClass('creator', 'partner')).toBe('item-swim-r')
    })
    it('allToOwner setzt alle auf einen Besitzer zurück', () => {
        const items = [si('1', 1, 'partner'), si('2', 2, 'partner'), si('3', 3)]
        expect(allToOwner(items, 'creator').every((i) => i.owner === 'creator')).toBe(true)
        expect(allToOwner(items, 'partner').every((i) => i.owner === 'partner')).toBe(true)
    })
    it('summiert die Spalten in Cent, negative Artikel zählen mit', () => {
        const items = [si('1', 1.99), si('2', 2.49, 'partner'), si('3', -0.25, 'partner'), si('4', 3.29)]
        expect(columnCents(items, 'creator')).toBe(528)
        expect(columnCents(items, 'partner')).toBe(224)
    })
    it('meldet, wenn die Artikel nicht den Bon-Betrag ergeben', () => {
        const items = [si('1', 10), si('2', 5, 'partner')]
        expect(itemsMismatch(1500, items)).toBeNull()
        expect(itemsMismatch(1948, items)).toEqual({ sumCents: 1500, restCents: 448 })
    })
})

describe('splitFromItems', () => {
    it('nimmt die Summe der Partner-Artikel als Anteil', () => {
        const items = [si('1', 10), si('2', 4.5, 'partner')]
        expect(splitFromItems(1500, items)).toEqual({ mode: 'items', partnerPercent: 30, partnerCents: 450 })
    })
    it('begrenzt für die Anzeige auf 0 bis Gesamtbetrag', () => {
        expect(splitFromItems(1000, [si('1', 20, 'partner')]).partnerCents).toBe(1000)
        expect(splitFromItems(1000, [si('1', -2, 'partner')]).partnerCents).toBe(0)
    })
})

describe('buildSaveInput', () => {
    it('Prozent', () => {
        expect(buildSaveInput(5, 1948, { mode: 'percent', partnerPercent: 40, partnerCents: 779 }, [])).toEqual({
            ok: true, input: { expenseId: 5, mode: 'percent', partnerPercent: 40 },
        })
    })
    it('Betrag in Euro', () => {
        expect(buildSaveInput(5, 1948, { mode: 'amount', partnerPercent: 26, partnerCents: 500 }, [])).toEqual({
            ok: true, input: { expenseId: 5, mode: 'amount', partnerAmount: 5 },
        })
    })
    it('Artikel gehen mit allen Besitzern an den Server', () => {
        const items = [si('1', 10), si('2', 5, 'partner')]
        const r = buildSaveInput(5, 1500, { mode: 'items', partnerPercent: 0, partnerCents: 0 }, items)
        expect(r).toEqual({ ok: true, input: { expenseId: 5, mode: 'items', items } })
    })
    it('lehnt Partner-Artikel über dem Gesamtbetrag mit der Meldung des Servers ab', () => {
        const items = [si('1', 10, 'partner'), si('2', 10, 'partner')]
        const r = buildSaveInput(1500, 1500, { mode: 'items', partnerPercent: 0, partnerCents: 0 }, items)
        expect(r).toEqual({ ok: false, error: 'Die Artikel des Partners ergeben mehr als den Gesamtbetrag.' })
    })
    it('lehnt einen Betrag außerhalb von 0 bis Gesamtbetrag ab', () => {
        const r = buildSaveInput(5, 1000, { mode: 'amount', partnerPercent: 100, partnerCents: 1200 }, [])
        expect(r.ok).toBe(false)
    })
})
