import type { ShareItem } from './types'

/** Betrag (Zahl oder Postgres-numeric-String) auf den nächsten Cent gerundet. */
export function toCents(v: number | string): number {
    return Math.round(Number(v) * 100)
}

/** Anteil des Partners in Cent; gerundet, die eintragende Person bekommt den Rest. */
export function partnerCentsForPercent(totalCents: number, percent: number): number {
    return Math.round((totalCents * percent) / 100)
}

/** Summe der Partner-Artikel in Cent (negative Artikel wie Pfand-Rückgabe zählen mit). */
export function partnerCentsForItems(items: ShareItem[]): number {
    return items.reduce((sum, i) => (i.owner === 'partner' ? sum + toCents(i.total_price) : sum), 0)
}

/** Teilt den Gesamtbetrag: Partner-Anteil fix, die eintragende Person bekommt den Rest. */
export function splitCents(totalCents: number, partnerCents: number): { creatorCents: number; partnerCents: number } {
    if (partnerCents < 0 || partnerCents > totalCents) {
        throw new Error('Die Artikel des Partners ergeben mehr als den Gesamtbetrag.')
    }
    return { creatorCents: totalCents - partnerCents, partnerCents }
}

/** Dreht den Besitzer genau eines Artikels; Reihenfolge und Eingabe bleiben unverändert. */
export function toggleOwner(items: ShareItem[], key: string): ShareItem[] {
    return items.map((i) => (i.key === key ? { ...i, owner: i.owner === 'creator' ? 'partner' : 'creator' } : i))
}

/** Startzustand beim Teilen nach Artikeln: alles gehört zunächst der eintragenden Person. */
export function initialItems(items: Omit<ShareItem, 'owner'>[]): ShareItem[] {
    return items.map((i) => ({ ...i, owner: 'creator' as const }))
}
