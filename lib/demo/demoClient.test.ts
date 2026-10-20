import { describe, it, expect, beforeEach } from 'vitest'
import { getDemoClient, resetDemoData } from './demoClient'
import { createDemoSeed, DEMO_USER } from './seed'
import { calculateGirokontoTimeline } from '@/utils/girokonto'
import { calculateMonthlyBudget } from '@/utils/financeHelpers'

const db = getDemoClient()

beforeEach(() => resetDemoData())

describe('Demo-Client', () => {
    it('liest mit Filter, Sortierung und Spaltenauswahl', async () => {
        const { data, error } = await db.from('fun_groups').select('name, start_date').eq('fun_account_id', 1).order('start_date', { ascending: true })
        expect(error).toBeNull()
        const rows = data as { name: string; start_date: string }[]
        expect(rows.map(r => r.name)).toEqual(['Konzerte', 'Städtetrip Hamburg'])
        expect(Object.keys(rows[0])).toEqual(['name', 'start_date'])
    })

    it('legt an, vergibt IDs und gibt mit select().single() die neue Zeile zurück', async () => {
        const { data } = await db.from('accounts').insert([{ name: 'Neu', amount: 10, months: 0, type: 'savings' }]).select().single()
        const row = data as Record<string, unknown>
        expect(row.id).toBe(3)
        expect(row.user_id).toBe(DEMO_USER.id)
        const { data: again } = await db.from('accounts').select('*').eq('id', 3).single()
        expect((again as Record<string, unknown>).name).toBe('Neu')
    })

    it('ändert und löscht nur passende Zeilen', async () => {
        await db.from('accounts').update({ amount: 1 }).eq('id', 1)
        await db.from('fixed_costs').delete().eq('linked_account_id', 1)
        const { data: acc } = await db.from('accounts').select('*').eq('id', 1).single()
        expect((acc as Record<string, unknown>).amount).toBe(1)
        const { data: fcs } = await db.from('fixed_costs').select('*')
        expect((fcs as unknown[]).length).toBe(5)
    })

    it('single() ohne Treffer liefert PGRST116, maybeSingle() liefert null', async () => {
        expect((await db.from('accounts').select('*').eq('id', 999).single()).error?.code).toBe('PGRST116')
        expect((await db.from('accounts').select('*').eq('id', 999).maybeSingle()).data).toBeNull()
    })

    it('neq/is/in filtern wie PostgREST', async () => {
        const { data: notFirst } = await db.from('accounts').select('id').neq('id', 1)
        expect(notFirst).toEqual([{ id: 2 }])
        const { data: ungrouped } = await db.from('fun_income_entries').select('id').is('group_id', null)
        expect(ungrouped).toEqual([{ id: 1 }])
        const { data: some } = await db.from('accounts').select('id').in('id', [2, 5])
        expect(some).toEqual([{ id: 2 }])
    })

    it('unbekannte Tabelle ergibt einen Fehler statt eines Netzaufrufs', async () => {
        const { data, error } = await db.from('gibt_es_nicht').select('*')
        expect(data).toBeNull()
        expect(error?.message).toMatch(/Demo/)
    })

    it('rpc ist in der Demo gesperrt, auth liefert den Demo-Nutzer', async () => {
        expect((await db.rpc()).error).not.toBeNull()
        expect((await db.auth.getUser()).data.user.id).toBe(DEMO_USER.id)
    })

    it('Zurücksetzen stellt die Beispieldaten wieder her', async () => {
        await db.from('expenses').delete().neq('id', 0)
        expect(((await db.from('expenses').select('id')).data as unknown[]).length).toBe(0)
        resetDemoData()
        expect(((await db.from('expenses').select('id')).data as unknown[]).length).toBeGreaterThan(50)
    })
})

describe('Beispieldaten', () => {
    const today = new Date('2026-10-12T12:00:00')
    const seed = createDemoSeed(today)

    it('sind deterministisch', () => {
        expect(createDemoSeed(today)).toEqual(seed)
    })

    it('reichen ca. 10 Wochen zurück und nicht in die Zukunft', () => {
        const dates = seed.expenses.map(e => String(e.expense_date)).sort()
        expect(dates[0]).toBe('2026-08-03')
        expect(dates[dates.length - 1] <= '2026-10-12').toBe(true)
    })

    it('ergeben eine Girokonto-Zeitreihe ohne NaN und ein sinnvolles Budget', () => {
        const result = calculateGirokontoTimeline(seed.expenses as never, seed.income_sources as never, seed.fixed_costs as never)
        expect(Number.isFinite(result.finalBalance)).toBe(true)
        expect(result.timeline.every(p => Number.isFinite(p.balance))).toBe(true)
        expect(calculateMonthlyBudget(seed.income_sources as never, seed.accounts as never)).toBe(3050)
    })

    it('jeder REWE-Bon summiert sich aus seinen Artikeln', () => {
        for (const e of seed.expenses.filter(x => x.description === 'REWE')) {
            const sum = seed.receipt_items.filter(i => i.expense_id === e.id).reduce((s, i) => s + Number(i.total_price), 0)
            expect(Math.round(sum * 100) / 100).toBe(e.amount)
        }
    })
})
