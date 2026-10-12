'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import MobileDashboard from '@/components/MobileDashboard'
import DemoBanner from '@/components/demo/DemoBanner'
import { enableDemoMode } from '@/lib/data/mode'
import { getDemoClient, resetDemoData } from '@/lib/demo/demoClient'
import { calculateMonthlyBudget } from '@/utils/financeHelpers'
import type { Expense, FixedCost, Settings, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'

type DemoData = {
    expenses: Expense[]
    monthlyBudget: number
    fixedCosts: FixedCost[]
    settings: Settings
    accounts: Account[]
    incomeSources: IncomeSource[]
    receiptItems: ReceiptItem[]
    products: Product[]
}

/**
 * Demo der App: dieselbe Oberfläche wie die echte App, aber alle Daten kommen
 * aus dem localStorage (lib/demo). Es gibt keinen Login und keinen einzigen
 * Aufruf an Supabase oder an eine Server Action.
 */
export default function DemoPage() {
    // Vor dem ersten Rendern umschalten — noch bevor irgendein Kind Daten anfasst.
    // Bewusst nie wieder zurückschalten: die Demo wird nur per vollem Seitenwechsel verlassen.
    useState(() => enableDemoMode())

    const [data, setData] = useState<DemoData | null>(null)
    const [version, setVersion] = useState(0)

    const load = useCallback(async () => {
        setData(await fetchDemoData())
    }, [])

    useEffect(() => {
        let alive = true
        fetchDemoData().then(d => { if (alive) setData(d) })
        return () => { alive = false }
    }, [])

    const handleReset = async () => {
        resetDemoData()
        await load()
        // Neu einhängen, damit auch der interne Zustand des Dashboards frisch startet.
        setVersion(v => v + 1)
    }

    if (!data) {
        return (
            <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden gap-6">
                <div className="ambient-bg" />
                <Loader2 className="z-10 w-7 h-7 animate-spin text-primary" strokeWidth={1.75} />
                <p className="z-10 eyebrow">Lade Demo</p>
            </div>
        )
    }

    return (
        <main className="h-[100dvh] w-full bg-background relative overflow-hidden">
            <div className="ambient-bg" />
            <div className="absolute inset-0 z-10">
                <MobileDashboard
                    key={version}
                    expenses={data.expenses}
                    initialBudget={data.monthlyBudget}
                    initialFixedCosts={data.fixedCosts}
                    initialSettings={data.settings}
                    initialAccounts={data.accounts}
                    initialIncomeSources={data.incomeSources}
                    receiptItems={data.receiptItems}
                    products={data.products}
                    onUpdate={load}
                />
            </div>
            <DemoBanner onStartTour={() => {}} onReset={handleReset} />
        </main>
    )
}

async function fetchDemoData(): Promise<DemoData> {
    const db = getDemoClient()
    const [expenses, fixedCosts, accounts, settings, incomeSources, receiptItems, products] = await Promise.all([
        db.from('expenses').select('*').order('created_at', { ascending: false }),
        db.from('fixed_costs').select('*'),
        db.from('accounts').select('*'),
        db.from('settings').select('*').single(),
        db.from('income_sources').select('*'),
        db.from('receipt_items').select('*'),
        db.from('products').select('*'),
    ])
    const accountList = (accounts.data || []) as Account[]
    const incomeList = (incomeSources.data || []) as IncomeSource[]
    return {
        expenses: (expenses.data || []) as Expense[],
        monthlyBudget: calculateMonthlyBudget(incomeList, accountList),
        fixedCosts: (fixedCosts.data || []) as FixedCost[],
        settings: settings.data as Settings,
        accounts: accountList,
        incomeSources: incomeList,
        receiptItems: (receiptItems.data || []) as ReceiptItem[],
        products: (products.data || []) as Product[],
    }
}
