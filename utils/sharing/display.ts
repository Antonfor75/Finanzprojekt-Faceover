import type { ShareMode } from './types'

/** Teilungsfelder einer Ausgabe. Bis `Expense` sie bekommt (Task 4), lokal beschrieben. */
export type ShareableExpense = {
    amount: number | string
    share_total?: number | string | null
    share_mode?: ShareMode | null
    share_note?: string | null
    shared_purchase_id?: string | null
}

const MODE_LABEL: Record<Exclude<ShareMode, 'percent'>, string> = { amount: 'Betrag', items: 'Artikel' }

/** Deutsches Geldformat: "1.234,50 €". */
function formatEuro(v: number): string {
    const [int, dec] = Math.abs(v).toFixed(2).split('.')
    return `${v < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`
}

/** Hinweis im Verlauf, z. B. "Geteilt mit lena · 50 %". null bei nicht geteilter Ausgabe. */
export function shareBadgeText(e: Pick<ShareableExpense, 'amount' | 'share_total' | 'share_mode' | 'share_note'>): string | null {
    if (!e.share_note) return null
    if (!e.share_mode) return e.share_note
    if (e.share_mode === 'percent') {
        const total = Number(e.share_total)
        if (!total) return e.share_note
        return `${e.share_note} · ${Math.round((Number(e.amount) / total) * 100)} %`
    }
    return `${e.share_note} · ${MODE_LABEL[e.share_mode]}`
}

/** Untertitel mit dem Gesamtbetrag, z. B. "von 19,48 €". null bei nicht geteilter Ausgabe. */
export function shareSubline(e: Pick<ShareableExpense, 'share_total' | 'share_note'>): string | null {
    if (!e.share_note || e.share_total == null) return null
    return `von ${formatEuro(Number(e.share_total))}`
}
