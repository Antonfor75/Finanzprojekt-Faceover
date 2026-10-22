import type { ReceiptItem } from '@/app/types'

/**
 * Reine Auswertung der Bon-Artikel (Verlauf und Analyse > Einkäufe).
 * Artikel mit shared_away = true gehören nach dem Teilen dem Partner und zählen in keiner Auswertung
 * und erscheinen in keiner Artikelliste (drizzle/0013).
 */

/** Ohne die Artikel, die beim Teilen zum Partner gewandert sind. */
export function visibleReceiptItems<T extends Pick<ReceiptItem, 'shared_away'>>(items: T[]): T[] {
    return items.filter((i) => !i.shared_away)
}

/** Artikel je Ausgabe; weggeteilte Artikel fehlen, eine Ausgabe ohne eigene Artikel hat keinen Eintrag. */
export function groupItemsByExpense(items: ReceiptItem[]): Map<number, ReceiptItem[]> {
    const map = new Map<number, ReceiptItem[]>()
    for (const item of visibleReceiptItems(items)) {
        const list = map.get(item.expense_id)
        if (list) list.push(item)
        else map.set(item.expense_id, [item])
    }
    return map
}

/** Eigene Quelle (Laden) im Kuchendiagramm? Von Hand erfasste und vom Partner geteilte Artikel sind keine. */
export function isStoreSource(source: ReceiptItem['source']): boolean {
    return source !== 'manual' && source !== 'shared'
}

export type ProductRow = { label: string; sub: string; value: number }

/** Summe je Produkt über die Artikel der gewählten Ausgaben, größte Summe zuerst. */
export function aggregateProducts(
    itemsByExpense: Map<number, ReceiptItem[]>,
    expenseIds: Iterable<number>,
    productName: (productId: number) => string | undefined,
): ProductRow[] {
    type Group = { name: string; qty: number; hasKg: boolean; hasPiece: boolean; lines: number; total: number }
    const groups = new Map<string, Group>()
    for (const expenseId of expenseIds) {
        for (const item of visibleReceiptItems(itemsByExpense.get(expenseId) || [])) {
            const key = item.product_id ? `p:${item.product_id}` : `r:${item.name_raw}`
            const name = (item.product_id && productName(item.product_id)) || item.name_raw
            let g = groups.get(key)
            if (!g) {
                g = { name, qty: 0, hasKg: false, hasPiece: false, lines: 0, total: 0 }
                groups.set(key, g)
            }
            g.qty += Number(item.quantity) || 1
            if (item.unit === 'kg') g.hasKg = true
            else g.hasPiece = true
            g.lines += 1
            g.total += Number(item.total_price)
        }
    }
    return [...groups.values()]
        .sort((a, b) => b.total - a.total)
        .map((g) => ({
            label: g.name,
            sub: g.hasKg && !g.hasPiece
                ? `${(Math.round(g.qty * 1000) / 1000)} kg`
                : g.hasKg
                    ? `${g.lines}×`
                    : `${Math.round(g.qty)}×`,
            value: g.total,
        }))
}
