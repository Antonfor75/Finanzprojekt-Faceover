'use client'

import { useState, useEffect, useMemo } from 'react'
import { loadTheme } from '@/utils/theme'
import { processWeeklySavings } from '@/app/actions/savings'
import { Wallet, ChevronRight, ArrowLeft, Settings, Trash2, List, Pencil, X, Home, PiggyBank, Download } from 'lucide-react'
import { startOfWeek, endOfWeek, format, isSameDay, isWithinInterval } from 'date-fns'
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
import WeeklyBarChart from './WeeklyBarChart'
import GirokontoView from './GirokontoView'
// import DashboardHealth from './DashboardHealth' // REMOVED
import { calculateGirokontoTimeline } from '@/utils/girokonto'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { Expense, FixedCost, Settings as SettingsType, Account, IncomeSource } from '@/app/types'

type MainView = 'entry' | 'history'

export default function MobileDashboard({
    expenses,
    initialBudget,
    initialFixedCosts,
    initialSettings,
    initialAccounts,
    initialIncomeSources,
    onUpdate
}: {
    expenses: Expense[],
    initialBudget: number,
    initialFixedCosts: FixedCost[],
    initialSettings: SettingsType,
    initialAccounts: Account[],
    initialIncomeSources: IncomeSource[],
    onUpdate?: () => void
}) {
    // --- APP STATE ---
    const [view, setView] = useState<MainView>('entry')
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [showGirokonto, setShowGirokonto] = useState(false)
    const [viewLevel, setViewLevel] = useState<'weeks' | 'days' | 'transactions'>('weeks')
    const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null)
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [historyMode, setHistoryMode] = useState<'calendar' | 'list' | 'analysis'>('calendar')
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

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
    const currentGiroBalance = useMemo(() => {
        if (expenses.length === 0 && initialIncomeSources.length === 0) return 0
        const result = calculateGirokontoTimeline(expenses, initialIncomeSources, initialFixedCosts)
        return result.finalBalance
    }, [expenses, initialFixedCosts, initialIncomeSources])

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

        // 4. Delete the expense
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
    // Filter out 'Konto:' expenses? Assuming yes.
    const relevantExpensesThisWeek = expenses.filter(e => {
        const d = new Date(e.expense_date || e.created_at)
        return isWithinInterval(d, { start: currentWeekStart, end: currentWeekEnd }) && !e.category?.startsWith('Konto:')
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



    if (isSettingsOpen) {
        return (
            <SettingsOverlay
                onBack={() => setIsSettingsOpen(false)}
                settings={initialSettings}
                fixedCosts={initialFixedCosts}
                accounts={initialAccounts}
                incomeSources={initialIncomeSources}
                onLogout={handleLogout}
                onUpdate={onUpdate}
                expenses={expenses}
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

            {/* === ENTRY VIEW === */}
            {view === 'entry' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden relative scroll-smooth">
                    <div className="w-full max-w-lg mx-auto px-4 flex flex-col gap-6 pt-10 pb-32 min-h-full">

                        {/* BEREICH 1: Verfügbares Budget (Top Center) */}
                        <div className="flex flex-col items-center justify-center pt-2 mb-4">
                            <h2 className="font-light uppercase tracking-widest text-center text-xs text-muted-foreground mb-2">
                                Verfügbar (Woche)
                            </h2>
                            <div className={`font-light tracking-tight leading-none text-center text-6xl ${isPositive ? 'text-foreground' : 'text-primary'}`}>
                                €{Math.floor(currentBalance)}<span className="text-3xl text-muted-foreground/60">.{(currentBalance % 1).toFixed(2).split('.')[1] || '00'}</span>
                            </div>
                        </div>

                        {/* BEREICH 2: Girokonto (Frosted Glass Card) */}
                        <div className="w-full">
                            <div
                                onClick={() => setShowGirokonto(true)}
                                className="bg-white/70 backdrop-blur-2xl border border-white/60 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer active:scale-95"
                            >
                                <div className="flex items-center justify-between z-10 relative">
                                    <div className="flex items-center gap-5">
                                        <div className="p-4 bg-white rounded-2xl text-primary shadow-sm">
                                            <PiggyBank className="w-8 h-8" strokeWidth={1.5} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-light uppercase tracking-widest text-muted-foreground mb-1">Girokonto</p>
                                            <p className={`text-2xl font-light ${currentGiroBalance < 0 ? 'text-red-500' : 'text-foreground'}`}>
                                                €{currentGiroBalance.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-full flex flex-col justify-center items-end">
                                        <ChevronRight className="text-primary/40 w-6 h-6" />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[10px] text-center text-muted-foreground/50 font-medium mt-3 uppercase tracking-wider">
                                Dynamisch berechnet
                            </p>
                        </div>

                        {/* BEREICH 3: Eingabe-Panel (Frosted Glass Container) */}
                        <div className="bg-white/70 backdrop-blur-2xl border border-white/60 rounded-[2rem] p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] z-10 overflow-hidden mt-2">
                            <AddExpenseForm accounts={initialAccounts} onRefresh={onUpdate} />
                        </div>

                    </div>
                </div>
            )}

            {/* === HISTORY VIEW === */}
            {view === 'history' && (
                <div className="w-full h-full flex flex-col pt-[env(safe-area-inset-top)] px-4 pb-0 max-w-xl mx-auto">
                    {/* Header & Tabs */}
                    <div className="flex flex-col gap-1 mb-1 shrink-0 mt-1">
                        {/* Tabs - Spread out and moved up */}
                        <Tabs value={historyMode} onValueChange={(val: any) => setHistoryMode(val)} className="w-full">
                            <TabsList className="flex w-full rounded-2xl p-1 h-auto bg-muted/50">
                                <TabsTrigger value="calendar" className="flex-1 py-2.5 rounded-xl text-sm font-bold data-[state=active]:text-primary data-[state=active]:bg-card">Kalender</TabsTrigger>
                                <TabsTrigger value="list" className="flex-1 py-2.5 rounded-xl text-sm font-bold data-[state=active]:text-primary data-[state=active]:bg-card">Liste</TabsTrigger>
                                <TabsTrigger value="analysis" className="flex-1 py-2.5 rounded-xl text-sm font-bold data-[state=active]:text-primary data-[state=active]:bg-card">Analyse</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {/* Back Button (Only if going deep) */}
                        <div className={`flex items-center justify-start ${viewLevel === 'weeks' ? 'hidden' : 'block'}`}>
                            <button
                                onClick={() => viewLevel !== 'weeks' && handleBackHistory()}
                                className="flex items-center gap-2 text-primary hover:opacity-70"
                            >
                                <ArrowLeft className="w-6 h-6" />
                                <span className="text-sm font-bold">Zurück</span>
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-4 pb-32 overflow-y-auto relative border-border/5">
                        {historyMode === 'list' && (
                            <button
                                onClick={generatePDF}
                                className="absolute right-4 top-4 text-primary/70 hover:text-primary text-xs flex items-center gap-1 z-10 bg-muted px-2 py-1 rounded-lg"
                            >
                                <Download className="w-3 h-3" /> PDF
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
                            />
                        ) : historyMode === 'calendar' ? (
                            <CalendarHistory
                                expenses={expenses}
                                weeklyBudget={weeklyBudget}
                                onDayClick={handleCalendarDayClick}
                            />
                        ) : (
                            <div className="space-y-2">
                                {viewLevel === 'weeks' && (
                                    getWeeklyGroups().map((group, idx) => (
                                        <div key={idx} onClick={() => handleWeekClick(group.start)} className="flex justify-between items-center p-4 bg-card/50 rounded-2xl cursor-pointer hover:bg-card transition-colors border border-border/20">
                                            <div>
                                                <p className="text-lg font-bold text-foreground">KW {format(group.start, 'w', { locale: de })}</p>
                                                <p className="text-xs text-muted-foreground">{format(group.start, 'dd.MM.')} - {format(endOfWeek(group.start, { weekStartsOn: 1 }), 'dd.MM.yyyy')}</p>
                                            </div>
                                            <div className="text-lg font-bold text-foreground">€{group.total.toFixed(2)}</div>
                                        </div>
                                    ))
                                )}
                                {viewLevel === 'days' && (
                                    getDailyGroups().map((group, idx) => (
                                        <div key={idx} onClick={() => handleDayClick(group.date)} className="flex justify-between items-center p-4 bg-card/50 rounded-2xl cursor-pointer hover:bg-card transition-colors border border-border/20">
                                            <div className="flex items-center gap-3">
                                                <div className="text-lg font-bold text-primary/70">{format(group.date, 'dd.MM')}</div>
                                                <div className="text-base font-bold text-foreground">{format(group.date, 'EEEE', { locale: de })}</div>
                                            </div>
                                            <div className="text-lg font-bold text-foreground">€{group.total.toFixed(2)}</div>
                                        </div>
                                    ))
                                )}
                                {viewLevel === 'transactions' && (
                                    getTransactions().map(expense => (
                                        <div key={expense.id} className="flex justify-between items-center p-3 bg-card/40 border-b border-border">
                                            <div className="min-w-0 flex-1 mr-4">
                                                <p className="font-bold text-foreground truncate">{expense.description}</p>
                                                {expense.category && <span className="text-[10px] bg-muted text-primary px-2 py-0.5 rounded-full">{expense.category}</span>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-primary">-€{expense.amount.toFixed(2)}</span>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingExpense(expense) }} className="w-8 h-8 rounded-lg shadow-sm bg-card hover:bg-card hover:text-blue-500 text-muted-foreground border-none">
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={async (e) => { e.stopPropagation(); if (confirm('Löschen?')) await deleteExpenseLocal(expense.id) }} className="w-8 h-8 rounded-lg shadow-sm bg-card hover:bg-card hover:text-red-500 text-muted-foreground border-none">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* === BOTTOM NAVIGATION BAR (Apple Floating Island) === */}
            <div className="fixed bottom-6 left-0 w-full flex justify-center z-40 pointer-events-none pb-[env(safe-area-inset-bottom)] px-6">
                <div className="w-full max-w-sm flex justify-between items-center bg-white/70 backdrop-blur-3xl border border-white/60 rounded-full p-2 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                    
                    {/* LEFT: History */}
                    <button
                        onClick={() => setView('history')}
                        className={`p-3 md:p-4 rounded-full pointer-events-auto transition-all duration-300 flex-1 flex justify-center items-center font-medium ${view === 'history'
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'text-muted-foreground hover:bg-white/50'
                            }`}
                    >
                        <List className="w-5 h-5 md:w-6 md:h-6" strokeWidth={view==='history'? 2 : 1.5} />
                    </button>

                    {/* CENTER: Home */}
                    <button
                        onClick={() => setView('entry')}
                        className={`p-3 md:p-4 rounded-full pointer-events-auto transition-all duration-300 flex-1 flex justify-center items-center font-medium mx-1 ${view === 'entry'
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'text-muted-foreground hover:bg-white/50'
                            }`}
                    >
                        <Home className="w-5 h-5 md:w-6 md:h-6" strokeWidth={view==='entry'? 2 : 1.5} />
                    </button>

                    {/* RIGHT: Settings */}
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className={`p-3 md:p-4 rounded-full pointer-events-auto transition-all duration-300 flex-1 flex justify-center items-center font-medium ${isSettingsOpen
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'text-muted-foreground hover:bg-white/50'
                            }`}
                    >
                        <Settings className="w-5 h-5 md:w-6 md:h-6" strokeWidth={isSettingsOpen ? 2 : 1.5} />
                    </button>
                </div>
            </div>

            {/* Edit Expense Dialog */}
            <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
                <DialogContent className="sm:max-w-[425px] rounded-3xl p-8 bg-card border-none shadow-2xl mx-4 max-w-[calc(100%-2rem)]">
                    <DialogHeader>
                        <DialogTitle className="text-4xl font-bold mb-8 text-center text-foreground">Eintrag bearbeiten</DialogTitle>
                        <DialogDescription className="sr-only">Passen Sie die Details Ihrer Ausgabe an.</DialogDescription>
                    </DialogHeader>
                    <form action={handleEditSave} className="space-y-6">
                        <div className="space-y-2">
                            <input
                                type="date"
                                name="date"
                                defaultValue={editingExpense?.expense_date ? new Date(editingExpense.expense_date).toISOString().split('T')[0] : (editingExpense?.created_at ? new Date(editingExpense.created_at).toISOString().split('T')[0] : '')}
                                required
                                onClick={(e) => e.currentTarget.showPicker()}
                                className="w-full text-[35px] text-center border-none shadow-md rounded-2xl py-3 bg-muted outline-none focus:ring-2 focus:ring-primary cursor-pointer text-foreground"
                            />
                        </div>
                        <select
                            name="category"
                            defaultValue={editingExpense?.category || 'Sonstiges'}
                            className="w-full text-[35px] text-center border-none shadow-md rounded-2xl py-3 bg-muted outline-none focus:ring-2 focus:ring-primary appearance-none text-foreground"
                        >
                            <option value="Essen">Essen 🍔</option>
                            <option value="Schminki Schminki">Schminki Schminki 💄</option>
                            <option value="Shoppi">Shoppi 🛍️</option>
                            <option value="Freizeit">Freizeit 🎉</option>
                            <option value="Sparen">Sparen 💰</option>
                            <option value="Sonstiges">Sonstiges 📦</option>
                        </select>
                        <input type="hidden" name="description" value="" />
                        <Input
                            type="number"
                            name="amount"
                            step="0.01"
                            inputMode="decimal"
                            defaultValue={editingExpense?.amount}
                            placeholder="Betrag €"
                            required
                            className="w-full text-[35px] text-center border-none shadow-md rounded-2xl py-3 bg-muted outline-none focus:ring-2 focus:ring-primary placeholder-muted-foreground h-auto text-foreground"
                        />
                        <Button
                            type="submit"
                            className="w-full text-[35px] font-bold text-center bg-primary text-primary-foreground rounded-2xl py-8 block hover:opacity-90 transition-all active:scale-95 shadow-md h-auto"
                        >
                            Speichern
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    )
}