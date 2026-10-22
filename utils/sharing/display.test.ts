import { describe, it, expect } from 'vitest'
import { shareBadgeText, shareSubline, sharedExpenseGuard, sharedUpdateBlocked, planExpenseEdit, planExpenseDelete } from './display'

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
    it('zeigt bei Betrag den eigenen Prozentanteil wie bei Prozent', () => {
        const e = { amount: 5, share_total: 20, share_mode: 'amount' as const, share_note: 'Von lena geteilt' }
        expect(shareBadgeText(e)).toBe('Von lena geteilt · 25 %')
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

describe('sharedExpenseGuard', () => {
    it('ergibt null bei nicht geteilter Ausgabe', () => {
        expect(sharedExpenseGuard({ shared_purchase_id: null }, 'delete')).toBeNull()
        expect(sharedExpenseGuard({}, 'update-amount')).toBeNull()
    })
    it('lehnt das Löschen einer geteilten Ausgabe ab', () => {
        expect(sharedExpenseGuard({ shared_purchase_id: 'abc' }, 'delete'))
            .toBe('Geteilte Ausgabe – bitte über „Für beide löschen“ entfernen.')
    })
    it('lehnt das Ändern von Betrag und Datum einer geteilten Ausgabe ab', () => {
        expect(sharedExpenseGuard({ shared_purchase_id: 'abc' }, 'update-amount'))
            .toBe('Geteilte Ausgabe – Betrag über „Teilung ändern“ anpassen.')
    })
})

describe('sharedUpdateBlocked', () => {
    const shared = { shared_purchase_id: 'abc', amount: 9.52, expense_date: '2026-10-20T12:00:00.000Z' }
    it('erlaubt alles bei nicht geteilter Ausgabe', () => {
        expect(sharedUpdateBlocked({ shared_purchase_id: null, amount: 5, expense_date: '2026-10-20' }, { amount: 7, expense_date: '2026-10-21' })).toBeNull()
        expect(sharedUpdateBlocked(undefined, { amount: 7, expense_date: '2026-10-21' })).toBeNull()
    })
    it('erlaubt bei geteilter Ausgabe, wenn Betrag und Datum gleich bleiben (nur Beschreibung/Kategorie)', () => {
        expect(sharedUpdateBlocked(shared, { amount: 9.52, expense_date: '2026-10-20' })).toBeNull()
    })
    it('lehnt eine Betragsänderung ab', () => {
        expect(sharedUpdateBlocked(shared, { amount: 10, expense_date: '2026-10-20' }))
            .toBe('Geteilte Ausgabe – Betrag über „Teilung ändern“ anpassen.')
    })
    it('lehnt eine Datumsänderung ab', () => {
        expect(sharedUpdateBlocked(shared, { amount: 9.52, expense_date: '2026-10-19' }))
            .toBe('Geteilte Ausgabe – Betrag über „Teilung ändern“ anpassen.')
    })
    it('versteht den Betrag auch als Postgres-Text', () => {
        expect(sharedUpdateBlocked({ ...shared, amount: '9.52' as unknown as number }, { amount: 9.52, expense_date: '2026-10-20' })).toBeNull()
    })
})

describe('planExpenseEdit / planExpenseDelete', () => {
    const shared = { shared_purchase_id: 'abc', amount: 9.52, expense_date: '2026-10-20' }
    const form = { description: 'Neu', category: 'Essen', amount: 9.52, expense_date: '2026-10-20' }
    it('lässt nicht geteilte Ausgaben normal bearbeiten', () => {
        expect(planExpenseEdit({ shared_purchase_id: null, amount: 1, expense_date: '2026-10-20' }, form)).toEqual({ kind: 'normal' })
        expect(planExpenseEdit(undefined, form)).toEqual({ kind: 'normal' })
    })
    it('lehnt bei geteilter Ausgabe Betrag oder Datum ab', () => {
        expect(planExpenseEdit(shared, { ...form, amount: 12 })).toEqual({ kind: 'blocked', message: 'Geteilte Ausgabe – Betrag über „Teilung ändern“ anpassen.' })
        expect(planExpenseEdit(shared, { ...form, expense_date: '2026-10-21' }).kind).toBe('blocked')
    })
    it('schreibt bei geteilter Ausgabe ohne Betrags-/Datumsänderung nur Beschreibung und Kategorie', () => {
        expect(planExpenseEdit(shared, form)).toEqual({ kind: 'shared-text-only', patch: { description: 'Neu', category: 'Essen' } })
    })
    it('lehnt das Löschen einer geteilten Ausgabe ab, erlaubt es sonst', () => {
        expect(planExpenseDelete({ shared_purchase_id: 'abc' })).toBe('Geteilte Ausgabe – bitte über „Für beide löschen“ entfernen.')
        expect(planExpenseDelete({ shared_purchase_id: null })).toBeNull()
        expect(planExpenseDelete(null)).toBeNull()
    })
})
