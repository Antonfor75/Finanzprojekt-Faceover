import { describe, it, expect } from 'vitest'
import { shareBadgeText, shareSubline } from './display'

describe('shareBadgeText / shareSubline', () => {
    it('ergibt null bei nicht geteilter Ausgabe', () => {
        const e = { amount: 5, share_total: null, share_mode: null, share_note: null }
        expect(shareBadgeText(e)).toBeNull()
        expect(shareSubline(e)).toBeNull()
    })
    it('zeigt bei Artikeln Modus und Gesamtbetrag', () => {
        const e = { amount: 9.96, share_total: 19.48, share_mode: 'items' as const, share_note: 'Geteilt mit lena' }
        expect(shareBadgeText(e)).toBe('Geteilt mit lena · Artikel')
        expect(shareSubline(e)).toBe('von 19,48 €')
    })
    it('zeigt bei Prozent den eigenen Anteil', () => {
        const e = { amount: 6.43, share_total: 12.85, share_mode: 'percent' as const, share_note: 'Geteilt mit lena' }
        expect(shareBadgeText(e)).toBe('Geteilt mit lena · 50 %')
    })
    it('zeigt bei Betrag den Modus', () => {
        const e = { amount: 5, share_total: 20, share_mode: 'amount' as const, share_note: 'Von lena geteilt' }
        expect(shareBadgeText(e)).toBe('Von lena geteilt · Betrag')
    })
    it('zeigt den Hinweis auch nach dem Trennen weiter (shared_purchase_id null)', () => {
        const e = { amount: 9.96, share_total: 19.48, share_mode: 'items' as const, share_note: 'Von lena geteilt', shared_purchase_id: null }
        expect(shareBadgeText(e)).toBe('Von lena geteilt · Artikel')
    })
    it('zeigt nur den Hinweis, wenn kein Modus gespeichert ist', () => {
        expect(shareBadgeText({ amount: 5, share_total: null, share_mode: null, share_note: 'Geteilt mit lena' })).toBe('Geteilt mit lena')
    })
    it('formatiert Tausender deutsch', () => {
        const e = { amount: 500, share_total: 1234.5, share_mode: 'amount' as const, share_note: 'x' }
        expect(shareSubline(e)).toBe('von 1.234,50 €')
    })
})
