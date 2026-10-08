import { describe, it, expect } from 'vitest'
import {
    validateTransferInput, planTransfer, roundCents, directionFromGiroAmount,
    giroExpenseAmount, funEffect, TRANSFER_CATEGORY, MANUAL_CATEGORY,
    type TransferInput, type TransferPlan,
} from './transfer'

const plan = (over: Partial<TransferInput> & { amount: number }): TransferPlan =>
    planTransfer({ direction: 'from_giro', reason: 'Kino', date: '2026-10-08', target: null, ...over }, 'tid-1')

/** Änderung des Spaßkonto-Saldos, die ein Plan bewirkt. */
const funChange = (p: TransferPlan): number => {
    if (!p.fun) return 0
    if (p.fun.kind === 'v2_income') return p.fun.row.amount
    if (p.fun.kind === 'v2_expense') return -p.fun.row.amount
    return p.fun.tx.amount
}

describe('validateTransferInput', () => {
    const base = { reason: 'Kino', date: '2026-10-08' }

    it('akzeptiert gültige Eingaben und rundet auf Cent', () => {
        expect(validateTransferInput({ amount: 12.345, ...base })).toEqual({ ok: true, amount: 12.35, reason: 'Kino' })
    })
    it('trimmt die Begründung', () => {
        const v = validateTransferInput({ amount: 5, reason: '  Pizza  ', date: base.date })
        expect(v.ok && v.reason).toBe('Pizza')
    })
    it.each([0, -3, NaN, Infinity, 0.001])('lehnt Betrag %s ab', (amount) => {
        expect(validateTransferInput({ amount, ...base }).ok).toBe(false)
    })
    it('verlangt eine Begründung', () => {
        expect(validateTransferInput({ amount: 5, reason: '   ', date: base.date }).ok).toBe(false)
    })
    it('verlangt ein Datum im Format yyyy-MM-dd', () => {
        expect(validateTransferInput({ amount: 5, reason: 'x', date: '' }).ok).toBe(false)
        expect(validateTransferInput({ amount: 5, reason: 'x', date: '08.10.2026' }).ok).toBe(false)
    })
})

describe('planTransfer – immer derselbe Betrag auf beiden Seiten', () => {
    const cases = [
        { dir: 'from_giro', kind: 'v2' },
        { dir: 'to_giro', kind: 'v2' },
        { dir: 'from_giro', kind: 'legacy' },
        { dir: 'to_giro', kind: 'legacy' },
    ] as const

    it.each(cases)('$dir / $kind: Girokonto-Änderung + Spaßkonto-Änderung = 0', ({ dir, kind }) => {
        const p = plan({ direction: dir, amount: 37.5, target: { kind, accountId: 7 } })
        // Eine Girokonto-Ausgabe von +X senkt das Girokonto um X.
        const giroChange = -p.giro.amount
        expect(giroChange + funChange(p)).toBe(0)
        expect(Math.abs(giroChange)).toBe(37.5)
        const tid = p.fun!.kind === 'legacy' ? p.fun!.tx.transfer_id : p.fun!.row.transfer_id
        expect(tid).toBe('tid-1')
        expect(p.giro.transfer_id).toBe('tid-1')
        expect(p.giro.category).toBe(TRANSFER_CATEGORY)
    })

    it('from_giro + v2 → Einnahme im Spaßkonto, positive Girokonto-Ausgabe', () => {
        const p = plan({ direction: 'from_giro', amount: 20, target: { kind: 'v2', accountId: 1 } })
        expect(p.giro.amount).toBe(20)
        expect(p.fun).toMatchObject({ kind: 'v2_income', row: { amount: 20, income_date: '2026-10-08', description: 'Kino' } })
    })
    it('to_giro + v2 → Ausgabe im Spaßkonto, negative Girokonto-Ausgabe', () => {
        const p = plan({ direction: 'to_giro', amount: 20, target: { kind: 'v2', accountId: 1 } })
        expect(p.giro.amount).toBe(-20)
        expect(p.fun).toMatchObject({ kind: 'v2_expense', row: { amount: 20, expense_date: '2026-10-08' } })
    })
    it('legacy: balanceDelta und Buchungs-Betrag stimmen überein', () => {
        const up = plan({ direction: 'from_giro', amount: 9.99, target: { kind: 'legacy', accountId: 2 } })
        expect(up.fun).toMatchObject({ kind: 'legacy', balanceDelta: 9.99, tx: { amount: 9.99, type: 'transfer_in' } })
        const down = plan({ direction: 'to_giro', amount: 9.99, target: { kind: 'legacy', accountId: 2 } })
        expect(down.fun).toMatchObject({ kind: 'legacy', balanceDelta: -9.99, tx: { amount: -9.99, type: 'transfer_out' } })
    })
    it('ohne Spaßkonto: nur Girokonto, keine transfer_id, eigene Kategorie', () => {
        const p = plan({ direction: 'to_giro', amount: 15, target: null })
        expect(p.fun).toBeNull()
        expect(p.giro).toMatchObject({ amount: -15, transfer_id: null, category: MANUAL_CATEGORY })
    })
})

describe('Hilfsfunktionen', () => {
    it('roundCents', () => {
        expect(roundCents(1.005)).toBe(1.01)
        expect(roundCents(0.1 + 0.2)).toBe(0.3)
    })
    it('Richtung aus gespeichertem Girokonto-Betrag', () => {
        expect(directionFromGiroAmount(12)).toBe('from_giro')
        expect(directionFromGiroAmount(-12)).toBe('to_giro')
    })
    it('Girokonto- und Spaßkonto-Änderung heben sich in beiden Richtungen auf', () => {
        for (const d of ['from_giro', 'to_giro'] as const) {
            expect(-giroExpenseAmount(d, 8) + funEffect(d, 8)).toBe(0)
        }
    })
})
