import type { Expense } from '@/app/types'

/** Deutsches Geldformat: "1.234,50 €". */
export function formatEuro(v: number): string {
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

/** Sperrtext aller Teilen- und Verknüpfen-Knöpfe ohne Internet. */
export const NEEDS_INTERNET = 'Teilen braucht Internet'

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

/**
 * Schutz beim Bearbeiten einer geteilten Ausgabe: abgelehnt wird nur, wenn sich Betrag oder Datum wirklich ändern.
 * Beschreibung und Kategorie bleiben änderbar. Gibt die Meldung zurück oder null, wenn die Änderung erlaubt ist.
 */
export function sharedUpdateBlocked(
    existing: Pick<Expense, 'shared_purchase_id' | 'amount' | 'expense_date'> | null | undefined,
    form: { amount: number; expense_date: string },
): string | null {
    if (!existing?.shared_purchase_id) return null
    const changed = Number(existing.amount) !== form.amount
        || String(existing.expense_date ?? '').slice(0, 10) !== String(form.expense_date ?? '').slice(0, 10)
    return changed ? sharedExpenseGuard(existing, 'update-amount') : null
}

/** Was beim Bearbeiten einer Ausgabe im Verlauf geschieht (Entscheidung ohne Oberfläche, damit testbar). */
export type ExpenseEditPlan =
    | { kind: 'normal' }
    | { kind: 'blocked'; message: string }
    | { kind: 'shared-text-only'; patch: { description: string; category: string } }

/**
 * Geteilte Ausgabe: Betrag/Datum ändern wird abgelehnt, sonst werden nur Beschreibung und Kategorie geschrieben
 * (die Kopie des Partners bleibt unberührt). Nicht geteilte Ausgaben laufen wie bisher.
 */
export function planExpenseEdit(
    existing: Pick<Expense, 'shared_purchase_id' | 'amount' | 'expense_date'> | null | undefined,
    form: { description: string; category: string; amount: number; expense_date: string },
): ExpenseEditPlan {
    if (!existing?.shared_purchase_id) return { kind: 'normal' }
    const message = sharedUpdateBlocked(existing, form)
    if (message) return { kind: 'blocked', message }
    return { kind: 'shared-text-only', patch: { description: form.description, category: form.category } }
}

/** Meldung, wenn das Löschen im Verlauf nicht erlaubt ist (geteilte Ausgabe), sonst null. */
export function planExpenseDelete(expense: Pick<Expense, 'shared_purchase_id'> | null | undefined): string | null {
    return expense ? sharedExpenseGuard(expense, 'delete') : null
}
