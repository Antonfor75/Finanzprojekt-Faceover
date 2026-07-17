'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadTheme } from '@/utils/theme'
import { processWeeklySavings } from '@/app/actions/savings'
import { processFunAccountFeeds } from '@/app/actions/funAccount'
import { ArrowLeft, ArrowUpRight, Settings, Trash2, List, Pencil, Plus, Home, Download, TrendingUp, TrendingDown, CalendarClock, Check, ChevronDown, Wallet, ChevronRight, X, PiggyBank, Sparkles } from 'lucide-react'
import { startOfWeek, endOfWeek, format, isSameDay, isWithinInterval, getDaysInMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/utils/supabase'


import AddExpenseForm from './AddExpenseForm'
import SettingsOverlay from './SettingsOverlay'
import CalendarHistory from './CalendarHistory'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AnalysisView from './AnalysisView'
import GirokontoView from './GirokontoView'
import FunAccountView from './FunAccountView'
// import DashboardHealth from './DashboardHealth' // REMOVED
import { calculateGirokontoTimeline } from '@/utils/girokonto'
import { isBudgetRelevantExpense } from '@/utils/funAccount'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { Expense, FixedCost, Settings as SettingsType, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'

type MainView = 'entry' | 'history' | 'settings'

export default function MobileDashboard({
    expenses,
    initialBudget,
    initialFixedCosts,
    initialSettings,
    initialAccounts,
    initialIncomeSources,
    receiptItems = [],
    products = [],
    onUpdate
}: {
    expenses: Expense[],
    initialBudget: number,
    initialFixedCosts: FixedCost[],
    initialSettings: SettingsType,
    initialAccounts: Account[],
    initialIncomeSources: IncomeSource[],
    receiptItems?: ReceiptItem[],
    products?: Product[],
    onUpdate?: () => void
}) {
    // --- APP STATE ---
    const [view, setView] = useState<MainView>('entry')
    const [showGirokonto, setShowGirokonto] = useState(false)
    const [openFunAccountId, setOpenFunAccountId] = useState<number | null>(null)
    const [viewLevel, setViewLevel] = useState<'weeks' | 'days' | 'transactions'>('weeks')
    const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null)
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [historyMode, setHistoryMode] = useState<'calendar' | 'list' | 'analysis'>('calendar')
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
    const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(null)
    const [showAddSheet, setShowAddSheet] = useState(false)

    // Artikel (Bon-Positionen) nach Ausgabe gruppiert — optionale Zusatzinfo.
    const itemsByExpense = useMemo(() => {
        const map = new Map<number, ReceiptItem[]>()
        for (const item of receiptItems) {
            const list = map.get(item.expense_id)
            if (list) list.push(item)
            else map.set(item.expense_id, [item])
        }
        return map
    }, [receiptItems])

    // --- EFFECT: PROCESS SAVINGS & DISTRIBUTION ON MOUNT ---
    useEffect(() => {
        const initDashboard = async () => {
            console.log('--- Init Dashboard ---')
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 0. Load Theme
            loadTheme()

            // 1. Process Weekly Savings (The "Sunday Logic")
            await processWeeklySavings(user.id)

            // 1b. Credit monthly feeds to fun accounts (lazy, idempotent)
            const feedResult = await processFunAccountFeeds()
            if (feedResult.credited > 0) onUpdate?.()

            // 2. Process Monthly Distributions (The existing logic)
            const { data: accounts } = await supabase.from('accounts').select('*')
            const { data: settings } = await supabase.from('settings').select('*').single()

            if (!settings || !accounts) return

            const currentMonth = new Date().toISOString().slice(0, 7)
            let budgetIncrease = 0
            let updatesMade = false

            for (const account of accounts) {
                if (account.type === 'distribution' &&
                    account.processed_month !== currentMonth &&
                    account.amount > 0 &&
                    account.months > 0) {

                    // Check valid_from
                    if (account.valid_from) {
                        const validFromMonth = new Date(account.valid_from).toISOString().slice(0, 7)
                        if (currentMonth < validFromMonth) continue
                    }

                    const amountToDistribute = account.amount / account.months

                    await supabase.from('accounts').update({
                        amount: account.amount - amountToDistribute,
                        months: account.months - 1,
                        processed_month: currentMonth
                    }).eq('id', account.id)

                    budgetIncrease += amountToDistribute
                    updatesMade = true
                }
            }

            if (updatesMade && budgetIncrease > 0) {
                await supabase.from('settings').update({
                    monthly_budget: settings.monthly_budget + budgetIncrease
                }).eq('id', settings.id)
                onUpdate?.()
            }
        }
        initDashboard()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Run ONCE on mount. onUpdate dependency caused infinite loop.

    // --- CALCULATE GIROKONTO BALANCE (Dynamic Net Cashflow) ---
    const giroData = useMemo(() => {
        if (expenses.length === 0 && initialIncomeSources.length === 0) return { finalBalance: 0, timeline: [] as { date: Date; balance: number }[] }
        const result = calculateGirokontoTimeline(expenses, initialIncomeSources, initialFixedCosts)
        return { finalBalance: result.finalBalance, timeline: result.timeline }
    }, [expenses, initialFixedCosts, initialIncomeSources])
    const currentGiroBalance = giroData.finalBalance

    const handleLogout = async () => {
        await supabase.auth.signOut()
        // Page.tsx will handle the redirect/unmount
    }

    const updateExpenseLocal = async (id: number, formData: FormData) => {
        const description = formData.get('description') as string
        const amount = parseFloat(formData.get('amount') as string)
        const expense_date = formData.get('date') as string
        const category = formData.get('category') as string || 'Sonstiges'

        await supabase.from('expenses').update({
            description: description || category,
            amount,
            expense_date,
            category
        }).eq('id', id)
        onUpdate?.()
    }

    const deleteExpenseLocal = async (id: number) => {
        // 1. Get the expense to check for linked account
        const { data: expense } = await supabase.from('expenses').select('*').eq('id', id).single()

        if (expense?.account_id) {
            // 2. Fetch account
            const { data: account } = await supabase.from('accounts').select('*').eq('id', expense.account_id).single()
            if (account) {
                // 3. Refund the amount
                const { error: refundError } = await supabase.from('accounts').update({
                    amount: account.amount + Number(expense.amount)
                }).eq('id', account.id)

                if (refundError) console.error('Error refunding account:', refundError)
            }
        }

        // 4. Delete attached receipt items (optionale Zusatzinfo, sonst Waisen)
        await supabase.from('receipt_items').delete().eq('expense_id', id)

        // 5. Delete the expense
        await supabase.from('expenses').delete().eq('id', id)
        onUpdate?.()
    }

    const handleEditSave = async (formData: FormData) => {
        if (!editingExpense) return
        await updateExpenseLocal(editingExpense.id, formData)
        setEditingExpense(null)
    }

    // Budget Calculations
    // Budget Calculations
    const CONST_WEEKS_PER_MONTH = 4.33
    // FIXED: Filter expired fixed costs
    const activeFixedCostsForBudget = initialFixedCosts.filter(fc => {
        const now = new Date()
        const from = fc.valid_from ? new Date(fc.valid_from) : null
        const to = fc.valid_to ? new Date(fc.valid_to) : null
        if (from && now < from) return false
        if (to && now > to) return false
        return true
    })
    const totalFixed = activeFixedCostsForBudget.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const weeklyFixedCosts = totalFixed / CONST_WEEKS_PER_MONTH

    // --- DYNAMIC WEEKLY INCOME CALCULATION ---
    const now = new Date()
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 }) // Sunday

    const calculateWeeklyIncome = () => {
        // Fallback to static budget if no sources defined
        if (initialIncomeSources.length === 0) {
            return initialBudget / CONST_WEEKS_PER_MONTH
        }

        return initialIncomeSources.reduce((sum, src) => {
            const from = src.valid_from ? new Date(src.valid_from) : null
            const to = src.valid_to ? new Date(src.valid_to) : null

            // Check if source is active/valid in general for this period
            // If from/to are defined, they must overlap with current week
            // Actually, we need to distinguish One-Time vs Recurring

            // 1. One-Time Income (Project work, etc)
            // Logic: If the income's VALIDITY range is fully contained within this week?
            // User said: "wenn der bereich einer einnahme in dieser woche anfängt und endet"
            if (from && to && from >= currentWeekStart && to <= currentWeekEnd) {
                return sum + Number(src.amount)
            }

            // 2. Regular Income (Monthly/Weekly)
            // Check if active ('from' is before end of week, 'to' is after start of week)
            const isActive = (!from || from <= currentWeekEnd) && (!to || to >= currentWeekStart)

            if (isActive) {
                // If it's a one-time income that spans multiple weeks, we might treat it differently?
                // But user differentiation was "starts and ends in this week".
                // If it doesn't default to monthly logic?
                // We rely on 'frequency' if available, defaulting to monthly.

                switch (src.frequency) {
                    case 'daily': return sum + (Number(src.amount) * 7)
                    case 'weekly': return sum + Number(src.amount)
                    case 'yearly': return sum + (Number(src.amount) / 52)
                    case 'monthly':
                    default:
                        return sum + (Number(src.amount) / CONST_WEEKS_PER_MONTH)
                }
            }
            return sum
        }, 0)
    }

    const weeklyIncome = calculateWeeklyIncome()

    // Expenses for CURRENT WEEK ONLY
    // Account-paid expenses (savings/fun) are budget-neutral and excluded.
    const relevantExpensesThisWeek = expenses.filter(e => {
        const d = new Date(e.expense_date || e.created_at)
        return isWithinInterval(d, { start: currentWeekStart, end: currentWeekEnd }) && isBudgetRelevantExpense(e)
    })

    const totalSpentThisWeek = relevantExpensesThisWeek.reduce((acc, curr) => acc + Number(curr.amount), 0)

    // "Verfügbar (Woche)" = Weekly Income - Weekly Fixed - Spent This Week
    // We define weeklyBudget as the amount available BEFORE variable expenses
    const weeklyBudget = weeklyIncome - weeklyFixedCosts

    const currentBalance = weeklyBudget - totalSpentThisWeek
    const isPositive = currentBalance >= 0

    // (Unused legacy variables commented out/removed to clean up)
    // const weeklyGrossBudget = ...
    // const weeksPassed = ...
    // const totalAccumulatedBudget = ...

    const getDate = (e: Expense) => new Date(e.expense_date || e.created_at)


    // Groups logic
    const getWeeklyGroups = () => {
        const groups: Record<string, { start: Date, total: number, count: number }> = {}
        expenses.forEach(e => {
            const date = getDate(e)
            const start = startOfWeek(date, { weekStartsOn: 1 })
            const key = start.toISOString()
            if (!groups[key]) groups[key] = { start, total: 0, count: 0 }
            groups[key].total += Number(e.amount)
            groups[key].count += 1
        })
        return Object.values(groups).sort((a, b) => b.start.getTime() - a.start.getTime())
    }
    const getDailyGroups = () => {
        if (!selectedWeekStart) return []
        const weekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 })
        const weekExpenses = expenses.filter(e => isWithinInterval(getDate(e), { start: selectedWeekStart, end: weekEnd }))
        const groups: Record<string, { date: Date, total: number, count: number }> = {}
        weekExpenses.forEach(e => {
            const date = getDate(e)
            const key = format(date, 'yyyy-MM-dd')
            if (!groups[key]) groups[key] = { date, total: 0, count: 0 }
            groups[key].total += Number(e.amount)
            groups[key].count += 1
        })
        return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime())
    }
    const getTransactions = () => {
        if (!selectedDay) return []
        return expenses
            .filter(e => isSameDay(getDate(e), selectedDay))
            .sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
    }
    // Navigation
    const handleWeekClick = (start: Date) => { setSelectedWeekStart(start); setViewLevel('days') }
    const handleDayClick = (date: Date) => { setSelectedDay(date); setViewLevel('transactions') }
    const handleBackHistory = () => {
        if (viewLevel === 'transactions') setViewLevel('days')
        else if (viewLevel === 'days') { setViewLevel('weeks'); setSelectedWeekStart(null) }
    }
    const handleCalendarDayClick = (date: Date) => {
        const start = startOfWeek(date, { weekStartsOn: 1 })
        setSelectedWeekStart(start)
        setSelectedDay(date)
        setViewLevel('transactions')
        setHistoryMode('list')
    }

    // PDF Export
    const generatePDF = () => {
        const doc = new jsPDF()
        doc.setFontSize(18)
        doc.text("Meine Ausgaben Übersicht", 14, 22)
        doc.setFontSize(10)
        doc.text(`Wochenbudget: €${weeklyBudget.toFixed(2)}`, 14, 28)

        const sortedExpenses = [...expenses].sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
        const grouped: { [key: string]: { expenses: Expense[], total: number, start: Date } } = {}
        const weekKeys: string[] = []

        sortedExpenses.forEach(e => {
            const date = getDate(e)
            const start = startOfWeek(date, { weekStartsOn: 1 })
            const key = start.toISOString()
            if (!grouped[key]) {
                grouped[key] = { expenses: [], total: 0, start }
                weekKeys.push(key)
            }
            grouped[key].expenses.push(e)
            grouped[key].total += Number(e.amount)
        })

        weekKeys.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        const tableBody: any[] = []

        weekKeys.forEach(key => {
            const group = grouped[key]
            const groupWeekNum = format(group.start, 'w', { locale: de })
            const groupIsOverBudget = group.total > weeklyBudget
            group.expenses.forEach(e => {
                tableBody.push([
                    format(getDate(e), 'dd.MM.yyyy'),
                    e.description || e.category || 'Ausgabe',
                    `€${e.amount.toFixed(2)}`
                ])
            })
            tableBody.push([
                {
                    content: `Summe KW ${groupWeekNum}:`,
                    colSpan: 2,
                    styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] }
                },
                {
                    content: `€${group.total.toFixed(2)}`,
                    styles: {
                        fontStyle: 'bold',
                        textColor: groupIsOverBudget ? [220, 38, 38] : [22, 163, 74],
                        fillColor: [240, 240, 240]
                    }
                }
            ])
        })

        autoTable(doc, {
            head: [['Datum', 'Beschreibung', 'Betrag']],
            body: tableBody,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: [0, 0, 0] },
            styles: { fontSize: 10, cellPadding: 3 },
        })
        doc.save('Finanzbericht.pdf')
    }





    // --- FOKUS-RING & INSIGHTS (derived display data, no new logic) ---
    const isoDay = ((now.getDay() + 6) % 7) + 1 // Mo=1 … So=7
    const daysLeftInWeek = 8 - isoDay
    const dailyAllowance = daysLeftInWeek > 0 ? currentBalance / daysLeftInWeek : currentBalance
    const RING_R = 96
    const RING_CIRC = 2 * Math.PI * RING_R
    const ringProgress = !isPositive ? 1 : (weeklyBudget > 0 ? Math.min(1, Math.max(0, currentBalance / weeklyBudget)) : 0)

    // Girokonto sparkline: letzte 30 Tage, normalisiert auf 100x36 viewBox
    const sparkPoints = (() => {
        const tl = giroData.timeline.slice(-30)
        if (tl.length < 2) return ''
        const vals = tl.map(t => t.balance)
        const min = Math.min(...vals)
        const range = (Math.max(...vals) - min) || 1
        return tl.map((t, i) => `${((i / (tl.length - 1)) * 100).toFixed(1)},${(33 - ((t.balance - min) / range) * 30).toFixed(1)}`).join(' ')
    })()

    // Nächste Fixkosten-Abbuchung (nur wenn execution_day gepflegt ist)
    const nextFixedCost = (() => {
        const today = now.getDate()
        const dim = getDaysInMonth(now)
        let best: { title: string; amount: number; days: number } | null = null
        for (const fc of activeFixedCostsForBudget) {
            if (!fc.execution_day) continue
            let d = fc.execution_day - today
            if (d < 0) d += dim
            if (best === null || d < best.days) best = { title: fc.title, amount: Number(fc.amount), days: d }
        }
        return best
    })()

    // Kategorie-Trend: größte Kategorie dieser Woche vs. Ø der 4 Vorwochen
    const categoryInsight = (() => {
        if (relevantExpensesThisWeek.length === 0) return null
        const catTotals: Record<string, number> = {}
        relevantExpensesThisWeek.forEach(e => {
            const c = e.category || 'Sonstiges'
            catTotals[c] = (catTotals[c] || 0) + Number(e.amount)
        })
        const [topCat, topAmt] = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]
        const prevStart = new Date(currentWeekStart)
        prevStart.setDate(prevStart.getDate() - 28)
        const prevSpend = expenses.filter(e => {
            const d = getDate(e)
            // isBudgetRelevantExpense statt nur 'Konto:'-Prefix, damit der 4-Wochen-Schnitt
            // dieselbe Basis hat wie die aktuelle Woche (Fun-/Konto-Zahlungen ausgenommen).
            return d >= prevStart && d < currentWeekStart && (e.category || 'Sonstiges') === topCat && isBudgetRelevantExpense(e)
        }).reduce((s, e) => s + Number(e.amount), 0)
        const avgPrev = prevSpend / 4
        if (avgPrev <= 0) return null
        // Woche läuft noch: Vergleich auf anteiliges Wochenbudget hochrechnen
        const projected = (topAmt / isoDay) * 7
        const pct = Math.round(((projected - avgPrev) / avgPrev) * 100)
        return { category: topCat, pct }
    })()

    const openFunAccount = openFunAccountId !== null
        ? initialAccounts.find(a => a.id === openFunAccountId)
        : null

    if (openFunAccount) {
        const feedCost = initialFixedCosts.find(fc => fc.linked_account_id === openFunAccount.id)
        return (
            <FunAccountView
                account={openFunAccount}
                monthlyFeed={feedCost ? Number(feedCost.amount) : null}
                expenses={expenses}
                onBack={() => setOpenFunAccountId(null)}
                onUpdate={onUpdate}
            />
        )
    }

    if (showGirokonto) {
        return (
            <GirokontoView
                expenses={expenses}
                incomeSources={initialIncomeSources}
                initialFixedCosts={initialFixedCosts}
                currentGiroBalance={currentGiroBalance} // Pass the "True" value
                onBack={() => setShowGirokonto(false)}
            />
        )
    }


    return (
        <div id="dashboard-container" className="fixed inset-0 h-[100dvh] w-screen overflow-hidden relative transition-colors duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground">

            {/* === ENTRY VIEW: FOKUS-RING (Konzept A) + INSIGHTS (Konzept B) === */}
            {view === 'entry' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden relative scroll-smooth view-enter">
                    <div className="w-full max-w-lg mx-auto px-6 flex flex-col items-center pt-12 pb-40 min-h-full">

                        <p className="eyebrow mb-7">Verfügbar diese Woche</p>

                        {/* BUDGET-RING */}
                        <div className="relative aspect-square w-[min(64vw,240px)]" role="img" aria-label={`Noch €${Math.round(currentBalance)} von €${Math.round(weeklyBudget)} Wochenbudget verfügbar`}>
                            <svg viewBox="0 0 220 220" className="w-full h-full -rotate-90">
                                <circle cx="110" cy="110" r={RING_R} fill="none" stroke="var(--bg-muted)" strokeWidth="14" />
                                <circle
                                    cx="110" cy="110" r={RING_R} fill="none"
                                    stroke={isPositive ? 'var(--color-primary)' : 'var(--chart-neg-heavy)'}
                                    strokeWidth="14" strokeLinecap="round"
                                    strokeDasharray={`${(ringProgress * RING_CIRC).toFixed(1)} ${RING_CIRC.toFixed(1)}`}
                                    className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-strong)]"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`amount text-[clamp(1.75rem,9vw,3rem)] leading-none font-light ${isPositive ? 'text-foreground' : 'text-[var(--chart-neg-heavy)]'}`}>
                                    €{Math.round(currentBalance)}
                                </span>
                                <span className="text-[clamp(0.65rem,2.8vw,0.75rem)] text-muted-foreground mt-1.5">von €{Math.round(weeklyBudget)} Budget</span>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground mt-6">
                            Noch {daysLeftInWeek} {daysLeftInWeek === 1 ? 'Tag' : 'Tage'} · <span className="amount font-medium text-primary">€{Math.max(0, dailyAllowance).toFixed(0)} / Tag</span>
                        </p>

                        {/* STATS */}
                        <div className="w-full grid grid-cols-2 gap-2.5 mt-9">
                            <div className="surface p-4">
                                <p className="text-xs text-muted-foreground">Ausgegeben</p>
                                <p className="amount text-lg text-foreground mt-1">€{totalSpentThisWeek.toFixed(2)}</p>
                            </div>
                            <div className="surface p-4">
                                <p className="text-xs text-muted-foreground">Wochenbudget</p>
                                <p className="amount text-lg text-foreground mt-1">€{weeklyBudget.toFixed(2)}</p>
                            </div>
                        </div>

                        {/* INSIGHTS */}
                        <section className="w-full mt-10">
                            <h2 className="flex items-center gap-4 mb-4">
                                <span className="eyebrow">Insights</span>
                                <span className="h-px flex-1 bg-border" aria-hidden="true"></span>
                            </h2>
                            <div className="stagger-children flex flex-col gap-2.5">

                                {categoryInsight && Math.abs(categoryInsight.pct) >= 10 && (
                                    <div className="surface p-4 flex items-center gap-3">
                                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${categoryInsight.pct < 0 ? 'bg-[var(--chart-pos)]/12 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg)]/12 text-[var(--chart-neg-heavy)]'}`}>
                                            {categoryInsight.pct < 0 ? <TrendingDown className="w-4.5 h-4.5" strokeWidth={1.75} /> : <TrendingUp className="w-4.5 h-4.5" strokeWidth={1.75} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground">{categoryInsight.category} {categoryInsight.pct < 0 ? 'läuft gut' : 'läuft heiß'}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{Math.abs(categoryInsight.pct)} % {categoryInsight.pct < 0 ? 'unter' : 'über'} deinem 4-Wochen-Schnitt</p>
                                        </div>
                                    </div>
                                )}
                                {categoryInsight && Math.abs(categoryInsight.pct) < 10 && (
                                    <div className="surface p-4 flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                                            <Check className="w-4.5 h-4.5" strokeWidth={1.75} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground">{categoryInsight.category} im üblichen Rahmen</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">nahe an deinem 4-Wochen-Schnitt</p>
                                        </div>
                                    </div>
                                )}

                                <button onClick={() => setShowGirokonto(true)} className="surface press w-full p-4 text-left group">
                                    <div className="flex justify-between items-baseline">
                                        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                            Girokonto
                                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.75} />
                                        </p>
                                        <p className={`amount text-sm ${currentGiroBalance < 0 ? 'text-[var(--chart-neg-heavy)]' : 'text-foreground'}`}>€{currentGiroBalance.toFixed(2)}</p>
                                    </div>
                                    {sparkPoints && (
                                        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="w-full h-9 mt-2" aria-hidden="true">
                                            <polyline points={sparkPoints} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                        </svg>
                                    )}
                                </button>

                                {/* Spaßkonten — Logik aus dem Fun-Account-Branch, Optik ans neue Design angepasst */}
                                {initialAccounts.filter(a => a.type === 'fun').map(acc => {
                                    const feedCost = initialFixedCosts.find(fc => fc.linked_account_id === acc.id)
                                    return (
                                        <button key={acc.id} onClick={() => setOpenFunAccountId(acc.id)} className="surface press w-full p-4 text-left group">
                                            <div className="flex items-center gap-3">
                                                <span className="w-9 h-9 rounded-xl bg-[var(--color-primary)]/12 text-primary flex items-center justify-center shrink-0">
                                                    <Sparkles className="w-4.5 h-4.5" strokeWidth={1.75} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-foreground truncate">{acc.name}</p>
                                                    {feedCost && Number(feedCost.amount) > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-0.5"><span className="amount">+€{Number(feedCost.amount).toFixed(2)}</span> / Monat</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="amount text-sm text-foreground">€{Number(acc.amount).toFixed(2)}</p>
                                                    <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}

                                {nextFixedCost && (
                                    <div className="surface p-4 flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                                            <CalendarClock className="w-4.5 h-4.5" strokeWidth={1.75} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground truncate">{nextFixedCost.title} {nextFixedCost.days === 0 ? 'heute' : nextFixedCost.days === 1 ? 'morgen' : `in ${nextFixedCost.days} Tagen`}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5"><span className="amount">−€{nextFixedCost.amount.toFixed(2)}</span> · ist im Budget eingeplant</p>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </section>

                    </div>
                </div>
            )}

            {/* === HISTORY VIEW === */}
            {view === 'history' && (
                <div className="w-full h-full flex flex-col pt-[env(safe-area-inset-top)] px-4 pb-0 max-w-xl mx-auto view-enter">
                    {/* Header & Tabs */}
                    <div className="flex flex-col gap-2 mb-1 shrink-0 mt-3">
                        <Tabs value={historyMode} onValueChange={(val: any) => setHistoryMode(val)} className="w-full">
                            <TabsList className="flex w-full rounded-xl p-1 h-auto bg-muted/70">
                                <TabsTrigger value="calendar" className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-sm">Kalender</TabsTrigger>
                                <TabsTrigger value="list" className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-sm">Liste</TabsTrigger>
                                <TabsTrigger value="analysis" className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-sm">Analyse</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {/* Back Button (Only if going deep) */}
                        <div className={`flex items-center justify-start ${viewLevel === 'weeks' ? 'hidden' : 'block'}`}>
                            <button
                                onClick={() => viewLevel !== 'weeks' && handleBackHistory()}
                                className="press flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-200 py-1"
                            >
                                <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                                <span className="text-sm font-medium">Zurück</span>
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-4 pb-32 overflow-y-auto relative">
                        {historyMode === 'list' && (
                            <button
                                onClick={generatePDF}
                                className="press absolute right-4 top-4 text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 z-10 bg-card border border-border px-2.5 py-1.5 rounded-lg transition-colors duration-200"
                            >
                                <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> PDF
                            </button>
                        )}

                        {historyMode === 'analysis' ? (
                            <AnalysisView
                                expenses={expenses}
                                budget={weeklyBudget}
                                fixedCosts={initialFixedCosts}
                                accounts={initialAccounts}
                                incomeSources={initialIncomeSources}
                                currentGiroBalance={currentGiroBalance}
                                receiptItems={receiptItems}
                                products={products}
                            />
                        ) : historyMode === 'calendar' ? (
                            <CalendarHistory
                                expenses={expenses}
                                weeklyBudget={weeklyBudget}
                                onDayClick={handleCalendarDayClick}
                            />
                        ) : (
                            <div className="stagger-children pt-8">
                                {viewLevel === 'weeks' && (
                                    getWeeklyGroups().map((group, idx) => (
                                        <button key={idx} onClick={() => handleWeekClick(group.start)} className="ledger-row w-full text-left cursor-pointer group">
                                            <div>
                                                <p className="text-base font-semibold text-foreground">KW {format(group.start, 'w', { locale: de })}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{format(group.start, 'dd.MM.')} – {format(endOfWeek(group.start, { weekStartsOn: 1 }), 'dd.MM.yyyy')}</p>
                                            </div>
                                            <div className="amount text-base text-foreground group-hover:text-primary transition-colors duration-200">€{group.total.toFixed(2)}</div>
                                        </button>
                                    ))
                                )}
                                {viewLevel === 'days' && (
                                    getDailyGroups().map((group, idx) => (
                                        <button key={idx} onClick={() => handleDayClick(group.date)} className="ledger-row w-full text-left cursor-pointer group">
                                            <div className="flex items-baseline gap-3">
                                                <span className="amount text-sm text-muted-foreground">{format(group.date, 'dd.MM')}</span>
                                                <span className="text-base font-semibold text-foreground">{format(group.date, 'EEEE', { locale: de })}</span>
                                            </div>
                                            <div className="amount text-base text-foreground group-hover:text-primary transition-colors duration-200">€{group.total.toFixed(2)}</div>
                                        </button>
                                    ))
                                )}
                                {viewLevel === 'transactions' && (
                                    getTransactions().map(expense => {
                                        const items = itemsByExpense.get(expense.id)
                                        const isExpanded = expandedExpenseId === expense.id
                                        return (
                                            <div key={expense.id}>
                                                <div
                                                    className={`ledger-row ${items ? 'cursor-pointer' : ''}`}
                                                    onClick={() => { if (items) setExpandedExpenseId(isExpanded ? null : expense.id) }}
                                                >
                                                    <div className="min-w-0 flex-1 mr-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="font-medium text-foreground truncate">{expense.description}</p>
                                                            {items && (
                                                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} strokeWidth={2} />
                                                            )}
                                                        </div>
                                                        {expense.category && <span className="eyebrow">{expense.category}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="amount text-base text-foreground">−€{expense.amount.toFixed(2)}</span>
                                                        <div className="flex gap-1">
                                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingExpense(expense) }} className="press w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                                                                <Pencil className="w-4 h-4" strokeWidth={1.75} />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={async (e) => { e.stopPropagation(); if (confirm('Löschen?')) await deleteExpenseLocal(expense.id) }} className="press w-8 h-8 rounded-lg text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted">
                                                                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                                {items && isExpanded && (
                                                    <div className="pl-4 pr-2 pb-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                        {items.map(item => (
                                                            <div key={item.id} className="flex items-center justify-between text-sm">
                                                                <span className="text-muted-foreground truncate mr-3">
                                                                    {item.name_raw}
                                                                    {item.unit && (
                                                                        <span className="text-xs ml-1.5 opacity-70">
                                                                            {Number(item.quantity)} {item.unit === 'kg' ? 'kg' : '×'}{item.unit_price ? ` à €${Number(item.unit_price).toFixed(2)}` : ''}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className={`amount text-xs shrink-0 ${Number(item.total_price) < 0 ? 'text-[var(--chart-pos)]' : 'text-muted-foreground'}`}>
                                                                    €{Number(item.total_price).toFixed(2)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* === SETTINGS VIEW === */}
            {view === 'settings' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden relative scroll-smooth view-enter">
                    <div className="w-full max-w-lg mx-auto px-6 pt-14 pb-36 min-h-full">
                        <SettingsOverlay
                            settings={initialSettings}
                            fixedCosts={initialFixedCosts}
                            accounts={initialAccounts}
                            incomeSources={initialIncomeSources}
                            onLogout={handleLogout}
                            onUpdate={onUpdate}
                            expenses={expenses}
                            onBack={() => setView('entry')}
                        />
                    </div>
                </div>
            )}

            {/* === BOTTOM DOCK: Historie · [Center: + auf Startseite / Home sonst] · Einstellungen === */}
            <div className="fixed bottom-0 left-0 w-full flex justify-center z-40 pointer-events-none px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] transition-opacity duration-200 in-data-[keyboard=open]:opacity-0 in-data-[keyboard=open]:pointer-events-none">
                <div className="flex w-full max-w-lg items-center gap-1.5 pointer-events-auto bg-card/85 backdrop-blur-md border border-border rounded-2xl p-1.5 shadow-lg shadow-foreground/5">

                    <button
                        onClick={() => setView('history')}
                        aria-label="Historie"
                        aria-current={view === 'history' ? 'page' : undefined}
                        className={`press flex-1 h-14 rounded-xl flex items-center justify-center transition-colors duration-250 ease-[var(--ease-out-strong)] ${
                            view === 'history' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                        <List className="w-6 h-6" strokeWidth={1.75} />
                    </button>

                    {/* Center: auf der Startseite Ausgabe hinzufügen, sonst zurück zur Startseite */}
                    <button
                        onClick={() => view === 'entry' ? setShowAddSheet(true) : setView('entry')}
                        aria-label={view === 'entry' ? 'Neue Ausgabe hinzufügen' : 'Zur Startseite'}
                        className="press flex-[1.4] h-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25 transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)]"
                    >
                        {view === 'entry'
                            ? <Plus className="w-7 h-7" strokeWidth={2} />
                            : <Home className="w-6 h-6" strokeWidth={2} />}
                    </button>

                    <button
                        onClick={() => setView('settings')}
                        aria-label="Einstellungen"
                        aria-current={view === 'settings' ? 'page' : undefined}
                        className={`press flex-1 h-14 rounded-xl flex items-center justify-center transition-colors duration-250 ease-[var(--ease-out-strong)] ${
                            view === 'settings' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                        <Settings className="w-6 h-6" strokeWidth={1.75} />
                    </button>

                </div>
            </div>

            {/* Edit Expense Dialog */}
            <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
                <DialogContent className="sm:max-w-[400px] top-[calc(50%-var(--kb-inset)/2)] max-h-[calc(100dvh-var(--kb-inset)-2rem)] overflow-y-auto overscroll-contain rounded-3xl p-6 bg-card border border-border shadow-xl mx-4 max-w-[calc(100%-2rem)] transition-[top] duration-200 ease-[var(--ease-drawer)]">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-semibold tracking-tight text-foreground text-left">Eintrag bearbeiten</DialogTitle>
                        <DialogDescription className="sr-only">Passe die Details deiner Ausgabe an.</DialogDescription>
                    </DialogHeader>
                    <form action={handleEditSave} className="space-y-4 mt-2">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground pl-1">Datum</label>
                            <input
                                type="date"
                                name="date"
                                defaultValue={editingExpense?.expense_date ? new Date(editingExpense.expense_date).toISOString().split('T')[0] : (editingExpense?.created_at ? new Date(editingExpense.created_at).toISOString().split('T')[0] : '')}
                                required
                                onClick={(e) => e.currentTarget.showPicker()}
                                className="amount w-full text-base px-4 py-3 rounded-xl bg-muted/60 border border-transparent outline-none transition-[background-color,border-color] duration-200 focus:bg-card focus:border-border cursor-pointer text-foreground"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground pl-1">Kategorie</label>
                            <select
                                name="category"
                                defaultValue={editingExpense?.category || 'Sonstiges'}
                                className="w-full text-base font-medium px-4 py-3 rounded-xl bg-muted/60 border border-transparent outline-none transition-[background-color,border-color] duration-200 focus:bg-card focus:border-border appearance-none text-foreground"
                            >
                                <option value="Essen">Essen 🍔</option>
                                <option value="Schminki Schminki">Schminki Schminki 💄</option>
                                <option value="Shoppi">Shoppi 🛍️</option>
                                <option value="Freizeit">Freizeit 🎉</option>
                                <option value="Sparen">Sparen 💰</option>
                                <option value="Sonstiges">Sonstiges 📦</option>
                            </select>
                        </div>
                        <input type="hidden" name="description" value="" />
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground pl-1">Betrag</label>
                            <Input
                                type="number"
                                name="amount"
                                step="0.01"
                                inputMode="decimal"
                                defaultValue={editingExpense?.amount}
                                placeholder="0,00"
                                required
                                className="amount w-full text-2xl text-center px-4 py-3 rounded-xl bg-muted/60 border border-transparent outline-none transition-[background-color,border-color] duration-200 focus:bg-card focus:border-border placeholder:text-muted-foreground/50 h-auto text-foreground shadow-none"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="press w-full text-base font-semibold bg-primary text-primary-foreground rounded-xl py-6 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] transition-colors duration-200 h-auto shadow-none"
                        >
                            Speichern
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Neue Ausgabe — Bottom Sheet (FAB) */}
            <Dialog open={showAddSheet} onOpenChange={setShowAddSheet}>
                <DialogContent className="top-auto bottom-[var(--kb-inset)] left-0 right-0 translate-x-0 translate-y-0 w-full max-w-full sm:max-w-full max-h-[calc(100dvh-var(--kb-inset)-1rem)] overflow-y-auto overscroll-contain rounded-t-3xl rounded-b-none border-t border-x-0 border-b-0 border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl transition-[bottom] duration-200 ease-[var(--ease-drawer)] data-open:slide-in-from-bottom-10 data-closed:slide-out-to-bottom-10 in-data-[keyboard=open]:pb-6">
                    <DialogHeader className="max-w-md mx-auto w-full">
                        <DialogTitle className="font-display text-xl font-semibold tracking-tight text-foreground text-left">Neue Ausgabe</DialogTitle>
                        <DialogDescription className="sr-only">Trage eine neue Ausgabe ein.</DialogDescription>
                    </DialogHeader>
                    <div className="max-w-md mx-auto w-full">
                        <AddExpenseForm
                            accounts={initialAccounts}
                            onRefresh={() => { setShowAddSheet(false); onUpdate?.() }}
                        />
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    )
}