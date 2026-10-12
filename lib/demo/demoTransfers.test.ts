import { describe, it, expect, beforeEach } from 'vitest'
import { getDemoClient, resetDemoData } from './demoClient'
import { createTransfer, updateTransfer, deleteTransfer } from './demoActions'

const db = getDemoClient()
beforeEach(() => resetDemoData())

const funIncome = async () => ((await db.from('fun_income_entries').select('*')).data as Record<string, unknown>[])
const expenses = async () => ((await db.from('expenses').select('*')).data as Record<string, unknown>[])

describe('Umbuchung in der Demo', () => {
    it('Girokonto → Spaßkonto: beide Seiten bekommen denselben Betrag, ändern und löschen trifft beide', async () => {
        const before = (await expenses()).length
        const created = await createTransfer({ direction: 'from_giro', amount: 40, reason: 'Konzert', date: '2026-10-10', target: { kind: 'v2', accountId: 1 } })
        expect(created.success).toBe(true)
        const id = (created as { transferId: string }).transferId

        const giro = (await expenses()).filter(e => e.transfer_id === id)
        const fun = (await funIncome()).filter(e => e.transfer_id === id)
        expect(giro).toHaveLength(1)
        expect(fun).toHaveLength(1)
        expect(Math.abs(Number(giro[0].amount))).toBe(Number(fun[0].amount))

        expect((await updateTransfer(id, { amount: 55, reason: 'Konzert', date: '2026-10-11' })).success).toBe(true)
        const giro2 = (await expenses()).find(e => e.transfer_id === id)!
        const fun2 = (await funIncome()).find(e => e.transfer_id === id)!
        expect(Math.abs(Number(giro2.amount))).toBe(55)
        expect(Number(fun2.amount)).toBe(55)

        expect((await deleteTransfer(id)).success).toBe(true)
        expect((await expenses()).length).toBe(before)
        expect((await funIncome()).some(e => e.transfer_id === id)).toBe(false)
    })

    it('lehnt ungültige Beträge ab, ohne etwas zu buchen', async () => {
        const before = (await expenses()).length
        const r = await createTransfer({ direction: 'from_giro', amount: 0, reason: 'x', date: '2026-10-10', target: { kind: 'v2', accountId: 1 } })
        expect(r.success).toBe(false)
        expect((await expenses()).length).toBe(before)
    })
})
