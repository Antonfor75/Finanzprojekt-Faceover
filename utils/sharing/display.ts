import type { Expense } from '@/app/types'

/** Deutsches Geldformat: "1.234,50 €". */
function formatEuro(v: number): string {
    const [int, dec] = Math.abs(v).toFixed(2).split('.')
    return `${v < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`
}

/** Hinweis im Verlauf, z. B. "Geteilt mit lena · 50 %". null bei nicht geteilter Ausgabe. */
export function shareBadgeText(e: Pick<Expense, 'amount' | 'share_total' | 'share_mode' | 'share_note'>): string | null {
    if (!e.share_note) return null
    if (!e.share_mode) return e.share_note
    if (e.share_mode === 'items') return `${e.share_note} · Artikel`
    // percent und amount: der eigene Anteil in Prozent.
    const total = Number(e.share_total)
    if (!total) return e.share_note
    return `${e.share_note} · ${Math.round((Number(e.amount) / total) * 100)} %`
}

/** Untertitel mit dem Gesamtbetrag, z. B. "von 19,48 €". null bei nicht geteilter Ausgabe. */
export function shareSubline(e: Pick<Expense, 'share_total' | 'share_note'>): string | null {
    if (!e.share_note || e.share_total == null) return null
    return `von ${formatEuro(Number(e.share_total))}`
}

export const SHARED_DELETE_MESSAGE = 'Geteilte Ausgabe – bitte über „Für beide löschen“ entfernen.'
export const SHARED_AMOUNT_MESSAGE = 'Geteilte Ausgabe – Betrag über „Teilung ändern“ anpassen.'

/**
 * Schutz geteilter Ausgaben: Löschen sowie Betrag/Datum ändern geht nur über die Teilung, sonst stünde
 * die Kopie des Partners still daneben. Gibt die Meldung zurück oder null, wenn die Ausgabe nicht geteilt ist.
 */
export function sharedExpenseGuard(e: Pick<Expense, 'shared_purchase_id'>, op: 'delete' | 'update-amount'): string | null {
    if (!e.shared_purchase_id) return null
    return op === 'delete' ? SHARED_DELETE_MESSAGE : SHARED_AMOUNT_MESSAGE
}
