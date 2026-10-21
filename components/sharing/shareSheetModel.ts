import type { Expense, ReceiptItem } from '@/app/types'
import { isSpendingExpense } from '@/utils/transfer'
import { initialItems, partnerCentsForItems, partnerCentsForPercent, splitCents, toCents } from '@/utils/sharing/split'
import { visibleReceiptItems } from '@/utils/receiptItems'
import type { ItemOwner, SaveShareInput, SharedPurchase, ShareItem, ShareMode } from '@/utils/sharing/types'

/**
 * Reine Entscheidungen für Teilen-Fenster (C4), Artikel-Brett (D1) und Verlauf (E1).
 * Die Komponenten in components/sharing/ zeigen nur an, was hier entschieden wird.
 *
 * Begriffe: "creator" trägt die Ausgabe ein, "partner" ist der Freund, mit dem geteilt wird. Die Daten
 * (Partner-Anteil, Besitzer der Artikel) sind immer aus Sicht des creators. Die Anzeige ist aus Sicht
 * der Person, die das Fenster offen hat ("ich" steht links): Der Partner sieht dieselben Daten gespiegelt.
 */

export type ShareRole = ItemOwner
export type ShareAction = 'share' | 'change'

// ---------- Einstieg ----------

/**
 * Wird "Teilen" bzw. "Teilung ändern" angeboten? Nicht teilbar ist genau, was der Server ablehnt
 * (isSpendingExpense und Betrag > 0). Eine schon geteilte Ausgabe bleibt änderbar, auch wenn der eigene Anteil 0 ist.
 */
export function shareAction(
    e: Pick<Expense, 'id' | 'account_id' | 'category' | 'transfer_id' | 'amount' | 'shared_purchase_id'>,
    hasFriend: boolean,
): ShareAction | null {
    if (!hasFriend) return null
    if (e.id < 0) return null // noch nicht gespeichert (optimistisch angezeigt)
    if (e.shared_purchase_id) return 'change'
    if (isSpendingExpense(e) && Number(e.amount) > 0) return 'share'
    return null
}

export const shareActionLabel = (a: ShareAction): string => (a === 'change' ? 'Teilung ändern' : 'Teilen')

export const shareSheetTitle = (description: string, a: ShareAction): string =>
    a === 'change' ? `${description} Teilung ändern` : `${description} teilen`

export function unshareConfirmText(role: ShareRole, friendHandle: string): string {
    return role === 'creator'
        ? `Teilung aufheben? Die Ausgabe zählt dann wieder ganz bei dir, bei ${friendHandle} verschwindet sie.`
        : `Teilung aufheben? Die Ausgabe zählt dann wieder ganz bei ${friendHandle}, bei dir verschwindet sie.`
}

export const deleteConfirmText = (friendHandle: string): string =>
    `Für beide löschen? Die Ausgabe verschwindet bei dir und bei ${friendHandle}.`

/** Welche Seite der Teilung bin ich? Ohne bestehende Teilung bin ich der creator. */
export function roleIn(expense: Pick<Expense, 'id'>, sp: Pick<SharedPurchase, 'creator_expense_id'> | null): ShareRole {
    if (!sp) return 'creator'
    return sp.creator_expense_id === expense.id ? 'creator' : 'partner'
}

// ---------- Aufteilung nach Betrag (Balken, Betragsfelder) ----------

/** Stand der Aufteilung. Der Partner-Anteil in Cent ist die Wahrheit, der Prozentwert zeigt den Balken. */
export type SplitState = { mode: ShareMode; partnerPercent: number; partnerCents: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const percentOf = (totalCents: number, cents: number) => (totalCents > 0 ? Math.round((cents * 100) / totalCents) : 0)

export function splitFromPercent(totalCents: number, partnerPercent: number): SplitState {
    const p = clamp(Math.round(partnerPercent), 0, 100)
    return { mode: 'percent', partnerPercent: p, partnerCents: partnerCentsForPercent(totalCents, p) }
}

/** Prozentwert des Balkens aus Sicht der Person: ihr eigener Anteil steht links. */
export function viewPercent(role: ShareRole, split: Pick<SplitState, 'partnerPercent'>): number {
    return role === 'creator' ? 100 - split.partnerPercent : split.partnerPercent
}

/** Der Balken wurde auf `viewPercent` (eigener Anteil in Prozent) gezogen. */
export function splitFromViewPercent(totalCents: number, role: ShareRole, viewPct: number): SplitState {
    const v = clamp(Math.round(viewPct), 0, 100)
    return splitFromPercent(totalCents, role === 'creator' ? 100 - v : v)
}

/** Stand nach Artikeln: der Partner-Anteil ist die Summe seiner Artikel (auf 0 bis Gesamtbetrag begrenzt, der Server prüft streng). */
export function splitFromItems(totalCents: number, items: ShareItem[]): SplitState {
    const partnerCents = clamp(partnerCentsForItems(items), 0, totalCents)
    return { mode: 'items', partnerPercent: percentOf(totalCents, partnerCents), partnerCents }
}

/** Beträge für die beiden Farbflächen: ich links, der Freund rechts. */
export function amountsFor(totalCents: number, partnerCents: number, role: ShareRole): { meCents: number; friendCents: number } {
    const creatorCents = totalCents - partnerCents
    return role === 'creator' ? { meCents: creatorCents, friendCents: partnerCents } : { meCents: partnerCents, friendCents: creatorCents }
}

/** Deutsche Betragseingabe ("3,50", "1.234,50", "3.5", "7 €") in Cent. Leer ist 0, Unlesbares ist null. */
export function parseEuroInput(text: string): number | null {
    const t = text.replace(/[\s€]/g, '')
    if (t === '') return 0
    let n: string
    if (t.includes(',')) {
        if (!/^[\d.]*,\d*$/.test(t)) return null
        n = t.replace(/\./g, '').replace(',', '.')
    } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
        n = t.replace(/\./g, '') // Punkte als Tausendertrenner
    } else if (/^\d*\.?\d*$/.test(t)) {
        n = t
    } else {
        return null
    }
    if (n === '.') return null
    const v = Number(n)
    return Number.isFinite(v) ? Math.round(v * 100) : null
}

/**
 * Ein Betragsfeld wurde getippt: das andere rechnet den Rest, begrenzt auf 0 bis Gesamtbetrag.
 * `field` ist die Seite des getippten Feldes aus Sicht der Person ('me' links, 'friend' rechts).
 * Bei unlesbarer Eingabe bleibt der Stand (dieselbe Referenz).
 */
export function splitFromAmountInput(totalCents: number, role: ShareRole, field: 'me' | 'friend', text: string, prev: SplitState): SplitState {
    const cents = parseEuroInput(text)
    if (cents === null) return prev
    const typed = clamp(cents, 0, totalCents)
    const isPartnerField = (role === 'creator') === (field === 'friend')
    const partnerCents = isPartnerField ? typed : totalCents - typed
    return { mode: 'amount', partnerPercent: percentOf(totalCents, partnerCents), partnerCents }
}

/** Startwerte: neu 50 / 50, sonst der gespeicherte Stand der Teilung. */
export function initialSplit(expense: Pick<Expense, 'id' | 'amount' | 'share_total'>, sp: SharedPurchase | null): { role: ShareRole; totalCents: number; split: SplitState } {
    if (!sp) {
        // Eine schon geteilte Ausgabe trägt in `amount` nur den eigenen Anteil; der Gesamtbetrag steht in share_total.
        const totalCents = toCents(expense.share_total ?? expense.amount)
        return { role: 'creator', totalCents, split: splitFromPercent(totalCents, 50) }
    }
    const totalCents = toCents(sp.total)
    const role = roleIn(expense, sp)
    if (sp.mode === 'percent' && sp.partner_percent != null) {
        return { role, totalCents, split: splitFromPercent(totalCents, Number(sp.partner_percent)) }
    }
    const partnerCents = toCents(sp.partner_amount)
    return { role, totalCents, split: { mode: sp.mode, partnerPercent: percentOf(totalCents, partnerCents), partnerCents } }
}

// ---------- Aufteilung nach Artikeln (Brett) ----------

export function shareItemsFromReceipt(items: ReceiptItem[]): ShareItem[] {
    return initialItems(
        visibleReceiptItems(items).map((i) => ({
            key: String(i.id),
            name_raw: i.name_raw,
            quantity: Number(i.quantity),
            unit: i.unit ?? null,
            unit_price: i.unit_price == null ? null : Number(i.unit_price),
            total_price: Number(i.total_price),
        })),
    )
}

/** Artikel fürs Brett: bei bestehender Artikel-Teilung deren Liste (mit Besitzern), sonst die eigenen Bon-Artikel. */
export function itemsForBoard(sp: SharedPurchase | null, receiptItems: ReceiptItem[]): ShareItem[] {
    if (sp && sp.mode === 'items' && sp.items.length > 0) return sp.items
    return shareItemsFromReceipt(receiptItems)
}

/** Links steht immer die eigene Spalte: der creator sieht sich links, der Partner sich ebenfalls links (gespiegelt). */
export function boardLayout(role: ShareRole): { left: ItemOwner; right: ItemOwner } {
    return role === 'creator' ? { left: 'creator', right: 'partner' } : { left: 'partner', right: 'creator' }
}

/** Dreht den Besitzer des Artikels und hängt ihn ans Ende (der Zielspalte). null bei unbekanntem Schlüssel. */
export function moveItem(items: ShareItem[], key: string): { items: ShareItem[]; to: ItemOwner } | null {
    const found = items.find((i) => i.key === key)
    if (!found) return null
    const to: ItemOwner = found.owner === 'creator' ? 'partner' : 'creator'
    return { items: [...items.filter((i) => i.key !== key), { ...found, owner: to }], to }
}

/** Schwimmrichtung: in die linke Spalte nach links, sonst nach rechts. */
export function swimClass(to: ItemOwner, role: ShareRole): 'item-swim-l' | 'item-swim-r' {
    return to === boardLayout(role).left ? 'item-swim-l' : 'item-swim-r'
}

export const allToOwner = (items: ShareItem[], owner: ItemOwner): ShareItem[] => items.map((i) => (i.owner === owner ? i : { ...i, owner }))

/** Summe der Artikel einer Spalte in Cent (negative Artikel wie Pfand-Rückgabe zählen mit). */
export function columnCents(items: ShareItem[], owner: ItemOwner): number {
    return owner === 'partner'
        ? partnerCentsForItems(items)
        : items.reduce((sum, i) => (i.owner === 'creator' ? sum + toCents(i.total_price) : sum), 0)
}

/** Ergeben die Artikel nicht den Bon-Betrag (Rabatt, Pfand), trägt der creator den Rest. */
export function itemsMismatch(totalCents: number, items: ShareItem[]): { sumCents: number; restCents: number } | null {
    const sumCents = items.reduce((sum, i) => sum + toCents(i.total_price), 0)
    return sumCents === totalCents ? null : { sumCents, restCents: totalCents - sumCents }
}

// ---------- Speichern ----------

export type BuiltInput = { ok: true; input: SaveShareInput } | { ok: false; error: string }

/** Baut die Eingabe für actSaveShare; prüft vorab dieselben Grenzen wie der Server. */
export function buildSaveInput(expenseId: number, totalCents: number, split: SplitState, items: ShareItem[]): BuiltInput {
    if (split.mode === 'items') {
        try {
            splitCents(totalCents, partnerCentsForItems(items))
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : 'Ungültige Aufteilung.' }
        }
        return { ok: true, input: { expenseId, mode: 'items', items } }
    }
    if (split.partnerCents < 0 || split.partnerCents > totalCents) {
        return { ok: false, error: 'Der Anteil darf nicht größer als der Gesamtbetrag sein.' }
    }
    if (split.mode === 'amount') {
        return { ok: true, input: { expenseId, mode: 'amount', partnerAmount: split.partnerCents / 100 } }
    }
    return { ok: true, input: { expenseId, mode: 'percent', partnerPercent: split.partnerPercent } }
}
