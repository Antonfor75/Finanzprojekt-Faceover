import { describe, it, expect } from 'vitest'
import type { ReceiptItem } from '@/app/types'
import { aggregateProducts, groupItemsByExpense, isStoreSource, visibleReceiptItems } from './receiptItems'

const item = (over: Partial<ReceiptItem> & { id: number }): ReceiptItem => ({
    expense_id: 1,
    name_raw: 'Artikel',
    quantity: 1,
    unit: 'stk',
    unit_price: null,
    total_price: 1,
    source: 'manual',
    shared_away: false,
    ...over,
})

describe('visibleReceiptItems', () => {
    it('lässt Artikel mit shared_away = true weg', () => {
        const items = [item({ id: 1 }), item({ id: 2, shared_away: true }), item({ id: 3, shared_away: undefined })]
        expect(visibleReceiptItems(items).map((i) => i.id)).toEqual([1, 3])
    })
})

describe('groupItemsByExpense', () => {
    it('gruppiert nach Ausgabe und zählt weggeteilte Artikel nicht', () => {
        const map = groupItemsByExpense([
            item({ id: 1, expense_id: 10 }),
            item({ id: 2, expense_id: 10, shared_away: true }),
            item({ id: 3, expense_id: 11 }),
        ])
        expect(map.get(10)?.map((i) => i.id)).toEqual([1])
        expect(map.get(11)?.map((i) => i.id)).toEqual([3])
    })

    it('gibt für eine Ausgabe, deren Artikel alle weggeteilt sind, keinen Eintrag zurück', () => {
        const map = groupItemsByExpense([item({ id: 1, expense_id: 10, shared_away: true })])
        expect(map.has(10)).toBe(false)
    })
})

describe('isStoreSource', () => {
    it('zählt nur echte Läden, nicht manuelle oder geteilte Artikel', () => {
        expect(isStoreSource('rewe')).toBe(true)
        expect(isStoreSource('manual')).toBe(false)
        expect(isStoreSource('shared')).toBe(false)
    })
})

describe('aggregateProducts', () => {
    const names = (id: number) => (id === 7 ? 'Tomaten' : undefined)

    it('summiert je Produkt über die gewählten Ausgaben', () => {
        const byExpense = groupItemsByExpense([
            item({ id: 1, expense_id: 10, product_id: 7, name_raw: 'Tom. lose', total_price: 2.5 }),
            item({ id: 2, expense_id: 11, product_id: 7, name_raw: 'Tom. Pack', total_price: 1.5 }),
            item({ id: 3, expense_id: 11, name_raw: 'Brot', total_price: 3 }),
        ])
        const rows = aggregateProducts(byExpense, [10, 11], names)
        expect(rows).toEqual([
            { label: 'Tomaten', sub: '2×', value: 4 },
            { label: 'Brot', sub: '1×', value: 3 },
        ])
    })

    it('zählt weggeteilte Artikel nicht mit, auch wenn sie in der Map stehen', () => {
        const byExpense = new Map<number, ReceiptItem[]>([
            [10, [item({ id: 1, expense_id: 10, name_raw: 'Brot', total_price: 3 }), item({ id: 2, expense_id: 10, name_raw: 'Gouda', total_price: 4.19, shared_away: true })]],
        ])
        const rows = aggregateProducts(byExpense, [10], names)
        expect(rows).toEqual([{ label: 'Brot', sub: '1×', value: 3 }])
    })

    it('zeigt Gewichtsartikel in kg', () => {
        const byExpense = groupItemsByExpense([item({ id: 1, expense_id: 10, name_raw: 'Äpfel', unit: 'kg', quantity: 1.25, total_price: 3.1 })])
        expect(aggregateProducts(byExpense, [10], names)).toEqual([{ label: 'Äpfel', sub: '1.25 kg', value: 3.1 }])
    })
})
