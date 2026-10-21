import { describe, it, expect } from 'vitest'
import { toCents, partnerCentsForPercent, partnerCentsForItems, splitCents, toggleOwner, initialItems } from './split'
import type { ShareItem } from './types'

const item = (key: string, total_price: number, owner: ShareItem['owner'] = 'creator'): ShareItem => ({
    key, name_raw: `Artikel ${key}`, quantity: 1, unit: 'stk', unit_price: total_price, total_price, owner,
})

describe('toCents', () => {
    it('rechnet Strings und Zahlen exakt in Cent um', () => {
        expect(toCents('19.48')).toBe(1948)
        expect(toCents(0.1 + 0.2)).toBe(30)
        expect(toCents(-0.25)).toBe(-25)
    })
})

describe('partnerCentsForPercent', () => {
    it('halbiert gerade Beträge', () => {
        expect(partnerCentsForPercent(1948, 50)).toBe(974)
    })
    it('rundet den Anteil des Partners kaufmännisch', () => {
        expect(partnerCentsForPercent(1001, 33.33)).toBe(334)
    })
})

describe('partnerCentsForItems', () => {
    it('summiert nur die Artikel des Partners', () => {
        const items = [
            item('1', 3.29, 'partner'), item('2', 2.79, 'partner'), item('3', 1.95, 'partner'), item('4', 1.49, 'partner'),
            item('5', 9.96, 'creator'),
        ]
        expect(partnerCentsForItems(items)).toBe(952)
    })
    it('zieht negative Partner-Artikel (Pfand, Rabatt) ab', () => {
        const items = [item('1', 3, 'partner'), item('2', -0.25, 'partner')]
        expect(partnerCentsForItems(items)).toBe(275)
    })
})

describe('splitCents', () => {
    it('gibt der eintragenden Person den Rest', () => {
        expect(splitCents(1948, 952)).toEqual({ creatorCents: 996, partnerCents: 952 })
    })
    it('erlaubt die Grenzen 0 und Gesamtbetrag', () => {
        expect(splitCents(500, 0)).toEqual({ creatorCents: 500, partnerCents: 0 })
        expect(splitCents(500, 500)).toEqual({ creatorCents: 0, partnerCents: 500 })
    })
    it('wirft, wenn der Partner mehr als den Gesamtbetrag bekäme', () => {
        expect(() => splitCents(1948, 2000)).toThrow('Die Artikel des Partners ergeben mehr als den Gesamtbetrag.')
    })
    it('wirft auch bei negativem Partner-Anteil', () => {
        expect(() => splitCents(1948, -1)).toThrow('Die Artikel des Partners ergeben mehr als den Gesamtbetrag.')
    })
})

describe('toggleOwner', () => {
    it('dreht nur den Artikel mit diesem Schlüssel und lässt die Reihenfolge', () => {
        const items = [item('a', 1), item('local:b', 2), item('c', 3)]
        const out = toggleOwner(items, 'local:b')
        expect(out.map((i) => i.key)).toEqual(['a', 'local:b', 'c'])
        expect(out.map((i) => i.owner)).toEqual(['creator', 'partner', 'creator'])
        expect(toggleOwner(out, 'local:b')[1].owner).toBe('creator')
    })
    it('verändert die Eingabe nicht', () => {
        const items = [item('a', 1)]
        toggleOwner(items, 'a')
        expect(items[0].owner).toBe('creator')
    })
})

describe('initialItems', () => {
    it('setzt alle Artikel auf creator', () => {
        const raw = [
            { key: '1', name_raw: 'Milch', quantity: 1, unit: 'stk' as const, unit_price: 1.1, total_price: 1.1 },
            { key: 'local:2', name_raw: 'Äpfel', quantity: 0.5, unit: 'kg' as const, unit_price: 3, total_price: 1.5 },
        ]
        const out = initialItems(raw)
        expect(out.map((i) => i.owner)).toEqual(['creator', 'creator'])
        expect(out[1].name_raw).toBe('Äpfel')
    })
})
