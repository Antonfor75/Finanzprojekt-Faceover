import { describe, it, expect } from 'vitest'
import { expenseForRestore, countActiveShares, restoreSharesWarning } from './restoreExpenses'

const NOW = '2026-10-22T10:00:00.000Z'

describe('expenseForRestore', () => {
    it('löst die Teilung (shared_purchase_id, share_total, share_mode) und behält share_note', () => {
        const row = expenseForRestore({
            id: 5, user_id: 'alt', created_at: '2026-10-01T00:00:00Z', description: 'REWE', amount: 9.96, category: 'Essen',
            expense_date: '2026-10-20', account_id: null,
            shared_purchase_id: 'gone-uuid', share_total: 19.48, share_mode: 'items', share_note: 'Geteilt mit lena',
        }, new Map(), 'neu', NOW)
        expect(row.shared_purchase_id).toBeNull()
        expect(row.share_total).toBeNull()
        expect(row.share_mode).toBeNull()
        expect(row.share_note).toBe('Geteilt mit lena')
        expect(row.user_id).toBe('neu')
        expect(row.amount).toBe(9.96)
        expect(row).not.toHaveProperty('id')
        expect(row).not.toHaveProperty('created_at')
    })

    it('lässt ältere Backups ohne share_*-Spalten durchlaufen (Teilungsfelder werden null)', () => {
        const row = expenseForRestore({ id: 1, description: 'x', amount: 1, expense_date: '2026-01-01' }, new Map(), 'u', NOW)
        expect(row).toMatchObject({ description: 'x', amount: 1, shared_purchase_id: null, share_total: null, share_mode: null, user_id: 'u' })
    })

    it('ordnet das Konto neu zu und setzt unbekannte Konten auf null', () => {
        const map = new Map([[3, 33]])
        expect(expenseForRestore({ account_id: 3, expense_date: 'd' }, map, 'u', NOW).account_id).toBe(33)
        expect(expenseForRestore({ account_id: 4, expense_date: 'd' }, map, 'u', NOW).account_id).toBeNull()
        expect(expenseForRestore({ expense_date: 'd' }, map, 'u', NOW).account_id).toBeNull()
    })

    it('füllt ein fehlendes Datum aus created_at, sonst aus der aktuellen Zeit', () => {
        expect(expenseForRestore({ created_at: '2026-02-02T00:00:00Z' }, new Map(), 'u', NOW).expense_date).toBe('2026-02-02T00:00:00Z')
        expect(expenseForRestore({}, new Map(), 'u', NOW).expense_date).toBe(NOW)
    })
})

describe('countActiveShares / restoreSharesWarning', () => {
    it('zählt nur Ausgaben mit Teilung', () => {
        expect(countActiveShares([{ shared_purchase_id: 'a' }, { shared_purchase_id: null }, {}, { shared_purchase_id: 'b' }])).toBe(2)
        expect(countActiveShares(null)).toBe(0)
        expect(countActiveShares([])).toBe(0)
    })
    it('nennt die Anzahl in der Warnung', () => {
        expect(restoreSharesWarning(1)).toContain('1 Ausgabe ist')
        expect(restoreSharesWarning(3)).toContain('3 Ausgaben sind')
    })
})
