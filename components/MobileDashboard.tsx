'use client'

import { useState, useEffect, useMemo } from 'react'
import { processWeeklySavings } from '@/app/actions/savings'
import { Wallet, TrendingDown, Calendar, ChevronRight, ArrowLeft, Settings, AlertCircle, Trash2, Plus, List, Pencil, X, Home, PiggyBank } from 'lucide-react'
import { startOfWeek, endOfWeek, format, isSameDay, isWithinInterval, differenceInCalendarWeeks, min, startOfMonth, endOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/utils/supabase'
import { applyTheme } from '@/utils/theme'

import AddExpenseForm from './AddExpenseForm'
import SettingsOverlay from './SettingsOverlay'
import CalendarHistory from './CalendarHistory'
import AnalysisView from './AnalysisView'
import WeeklyBarChart from './WeeklyBarChart'
import GirokontoView from './GirokontoView'
// import DashboardHealth from './DashboardHealth' // REMOVED

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

    const [theme, setTheme] = useState('white')
    const [darkMode, setDarkMode] = useState(false)
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

    // --- EFFECT: LOAD THEME ---
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme')
        if (savedTheme) {
            setTheme(savedTheme)
        }
    }, [])

    // --- EFFECT: SAVE THEME & SYNC BODY BG ---
    useEffect(() => {
        localStorage.setItem('theme', theme)
        applyTheme(theme)
    }, [theme])

    // --- EFFECT: DARK MODE ---
    useEffect(() => {
        const savedDark = localStorage.getItem('darkMode')
        if (savedDark === 'true') {
            setDarkMode(true)
            document.documentElement.classList.add('dark')
        }
    }, [])

    const toggleDarkMode = () => {
        const newMode = !darkMode
        setDarkMode(newMode)
        localStorage.setItem('darkMode', String(newMode))
        if (newMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }

    // --- EFFECT: PROCESS SAVINGS & DISTRIBUTION ON MOUNT ---
    useEffect(() => {
        const initDashboard = async () => {
            console.log('--- Init Dashboard ---')
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

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

        // 1. Determine Start Date based on actual data
        const expenseDates = expenses.map(e => new Date(e.expense_date || e.created_at).getTime())
        const incomeDates = initialIncomeSources
            .filter(s => s.valid_from)
            .map(s => new Date(s.valid_from!).getTime())

        let minDateMs = Math.min(...expenseDates, ...incomeDates)
        if (minDateMs === Infinity) minDateMs = Date.now()

        const startDate = new Date(minDateMs)
        startDate.setDate(1)
        startDate.setHours(0, 0, 0, 0)

        const now = new Date()
        const loopEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0) // End of current month
        let tempDate = new Date(startDate)
        let totalNet = 0

        // Helper
        const getMonthKey = (date: Date) => format(date, 'yyyy-MM')

        // Pre-calculate expenses by month
        const expensesByMonth: Record<string, number> = {}
        expenses.forEach(e => {
            const d = new Date(e.expense_date || e.created_at)
            const key = getMonthKey(d)
            expensesByMonth[key] = (expensesByMonth[key] || 0) + Number(e.amount)
        })

        // REMOVED totalFixed calculation here as it is static and incorrect for historical calculations
        // const totalFixed = initialFixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0)

        while (tempDate <= loopEnd) {
            const mKey = getMonthKey(tempDate)
            const d = new Date(tempDate) // 1st of month

            // Top-up Income
            const monthIncome = initialIncomeSources.filter(src => {
                const from = src.valid_from ? new Date(src.valid_from) : null
                const to = src.valid_to ? new Date(src.valid_to) : null
                // Check if source valid in this month
                if (from && d < new Date(from.getFullYear(), from.getMonth(), 1)) return false
                if (to && d > to) return false
                return true
            }).reduce((sum, src) => sum + Number(src.amount), 0)

            // Heuristic: Only subtract fixed costs if there was AT LEAST one expense in this month
            // OR if it is the current month or recent past (to avoid punishing gaps in history)
            const hasActivity = monthIncome > 0 || (expensesByMonth[mKey] || 0) > 0

            // FIXED: Calculate fixed costs relevant for THIS month
            const monthFixed = hasActivity ? initialFixedCosts.reduce((acc, fc) => {
                const validFrom = fc.valid_from ? new Date(fc.valid_from) : null
                const validTo = fc.valid_to ? new Date(fc.valid_to) : null

                // Check if valid in this month
                if (validFrom && d < new Date(validFrom.getFullYear(), validFrom.getMonth(), 1)) return acc
                if (validTo && d > validTo) return acc

                return acc + Number(fc.amount)
            }, 0) : 0

            const monthVariable = expensesByMonth[mKey] || 0

            totalNet += (monthIncome - monthVariable - monthFixed)

            tempDate.setMonth(tempDate.getMonth() + 1)
        }

        return totalNet
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

    const getThemeBg = () => {
        switch (theme) {
            case 'pink': return 'bg-pink-100'
            case 'blue': return 'bg-blue-100'
            case 'green': return 'bg-green-100'
            case 'yellow': return 'bg-yellow-100'
            default: return 'bg-[#f8f5e6]'
        }
    }

    if (isSettingsOpen) {
        return (
            <SettingsOverlay
                onBack={() => setIsSettingsOpen(false)}
                settings={initialSettings}
                fixedCosts={initialFixedCosts}
                accounts={initialAccounts}
                incomeSources={initialIncomeSources}
                theme={theme}
                setTheme={setTheme}
                onLogout={handleLogout}
                onUpdate={onUpdate}
                expenses={expenses}
                isDarkMode={darkMode}
                toggleDarkMode={toggleDarkMode}
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

    if (editingExpense) {
        return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-3xl p-8 relative shadow-2xl">
                    <button
                        onClick={() => setEditingExpense(null)}
                        className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"
                    >
                        <X className="w-10 h-10" />
                    </button>
                    <h2 className="text-4xl font-bold mb-8 text-center">Eintrag bearbeiten</h2>
                    <form action={handleEditSave} className="space-y-6">
                        <div className="space-y-2">
                            <input
                                type="date"
                                name="date"
                                defaultValue={editingExpense.expense_date ? new Date(editingExpense.expense_date).toISOString().split('T')[0] : new Date(editingExpense.created_at).toISOString().split('T')[0]}
                                required
                                onClick={(e) => e.currentTarget.showPicker()}
                                className="w-full text-[35px] text-center border-none shadow-md rounded-2xl py-3 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
                            />
                        </div>
                        <select
                            name="category"
                            defaultValue={editingExpense.category || 'Sonstiges'}
                            className="w-full text-[35px] text-center border-none shadow-md rounded-2xl py-3 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 appearance-none"
                        >
                            <option value="Essen">Essen 🍔</option>
                            <option value="Miete">Miete 🏠</option>
                            <option value="Transport">Transport 🚌</option>
                            <option value="Freizeit">Freizeit 🎉</option>
                            <option value="Versicherung">Versicherung 🛡️</option>
                            <option value="Sparen">Sparen 💰</option>
                            <option value="Sonstiges">Sonstiges 📦</option>
                        </select>
                        <input type="hidden" name="description" value="" />
                        <input
                            type="number"
                            name="amount"
                            step="0.01"
                            inputMode="decimal"
                            defaultValue={editingExpense.amount}
                            placeholder="Betrag €"
                            required
                            className="w-full text-[35px] text-center border-none shadow-md rounded-2xl py-3 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
                        />
                        <button
                            type="submit"
                            className="w-full text-[35px] font-bold text-center bg-blue-500 text-white rounded-2xl py-4 block hover:bg-blue-600 transition-all active:scale-95 shadow-md"
                        >
                            Speichern
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className={`fixed inset-0 h-dvh w-screen overflow-hidden relative transition-colors duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${getThemeBg()} ${darkMode ? 'dark z-0' : ''}`}>

            {/* === ENTRY VIEW === */}
            {view === 'entry' && (
                <div className="w-full h-full flex justify-center overflow-hidden relative">
                    {/* Header Icon */}
                    <img
                        src="/head-icon.png"
                        alt="Header Icon"
                        className="absolute top-4 right-4 w-24 h-24 object-contain z-50 opacity-90"
                    />
                    <div className="grid grid-cols-12 grid-rows-[repeat(14,minmax(0,1fr))] w-[80%] h-full scale-[1.25] origin-top">

                        {/* BEREICH 1: Verfügbares Budget (Top Center) */}
                        <div className="row-start-1 row-span-2 col-start-2 col-span-10 flex flex-col justify-end items-center pb-2">
                            <h2 className="font-bold uppercase tracking-widest text-center text-xs text-muted-foreground dark:text-gray-400 mb-1">
                                Verfügbar (Woche)
                            </h2>
                            <div className={`font-bold tracking-tight leading-none text-center text-5xl ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                €{Math.floor(currentBalance)}<span className="text-2xl text-muted-foreground/60 dark:text-gray-500">.{(currentBalance % 1).toFixed(2).split('.')[1] || '00'}</span>
                            </div>
                        </div>

                        {/* BEREICH 2: Girokonto (formerly Sparkonto) */}
                        <div className="row-start-3 row-span-3 col-start-2 col-span-10 flex flex-col justify-center gap-2">
                            <div
                                onClick={() => setShowGirokonto(true)}
                                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-white/20 dark:border-white/5 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer active:scale-95"
                            >
                                <div className="flex items-center justify-between z-10 relative">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-pink-100 dark:bg-pink-900/30 rounded-xl text-pink-600 dark:text-pink-400">
                                            <PiggyBank className="w-10 h-10" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Girokonto</p>
                                            <p className={`text-2xl font-bold ${currentGiroBalance < 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                                                €{currentGiroBalance.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="h-full flex flex-col justify-center items-end">
                                        {currentGiroBalance > 0 && (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                                                +Liquide
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Decorative Background for visuals */}
                                <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-pink-500/10 rounded-full blur-2xl group-hover:bg-pink-500/20 transition-all"></div>
                            </div>

                            {/* Optional small helper text or indicator */}
                            <p className="text-[10px] text-center text-muted-foreground/50 italic">
                                Automatisch berechnet (Einnahmen - Ausgaben)
                            </p>
                        </div>

                        {/* BEREICH 3: Eingabe-Panel */}
                        <div className="row-start-6 row-span-4 col-start-2 col-span-10 flex flex-col justify-evenly bg-white/90 dark:bg-gray-900/60 dark:backdrop-blur-md dark:border dark:border-white/10 backdrop-blur-md border border-white/40 rounded-2xl p-2 shadow-xl z-10 overflow-hidden">
                            <AddExpenseForm accounts={initialAccounts} onRefresh={onUpdate} />
                        </div>

                        {/* BEREICH 4 & 5: Buttons removed in favor of Bottom Nav */}

                    </div>
                </div>
            )}

            {/* === HISTORY VIEW === */}
            {view === 'history' && (
                <div className="grid grid-cols-12 grid-rows-[repeat(14,minmax(0,1fr))] w-full h-full">

                    {/* BEREICH 1: Zurück-Button */}
                    <div className="row-start-1 row-span-1 col-start-1 col-span-3 flex items-center px-2">
                        <button
                            onClick={() => setView('entry')}
                            className="flex items-center gap-2 text-gray-600 hover:text-black transition-transform active:scale-95"
                        >
                            <ArrowLeft className="w-12 h-12" />
                            <span className="font-bold text-xl hidden sm:inline">Zurück</span>
                        </button>
                    </div>

                    {/* BEREICH 2: Reiter */}
                    <div className="row-start-2 row-span-1 col-start-4 col-span-6 flex justify-around items-center bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-1 z-10">
                        <button
                            onClick={() => setHistoryMode('calendar')}
                            className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-300 text-sm ${historyMode === 'calendar' ? 'bg-black/90 text-white shadow-md' : 'text-gray-600 hover:bg-white/40'}`}
                        >
                            Kalender
                        </button>
                        <button
                            onClick={() => setHistoryMode('list')}
                            className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-300 text-sm ${historyMode === 'list' ? 'bg-black/90 text-white shadow-md' : 'text-gray-600 hover:bg-white/40'}`}
                        >
                            Liste
                        </button>
                        <button
                            onClick={() => setHistoryMode('analysis')}
                            className={`flex-1 text-center py-3 rounded-xl font-bold transition-all duration-300 text-sm ${historyMode === 'analysis' ? 'bg-black/90 text-white shadow-md' : 'text-gray-600 hover:bg-white/40'}`}
                        >
                            Analyse
                        </button>
                    </div>

                    {/* BEREICH 3: Inhalt */}
                    <div className="row-start-3 row-span-12 col-start-1 col-span-12 bg-white rounded-t-3xl p-4 pb-28 overflow-y-auto shadow-[0_-5px_20px_rgba(0,0,0,0.1)] relative border-t border-gray-100">
                        {historyMode === 'list' && (
                            <button
                                onClick={generatePDF}
                                className="absolute right-6 top-6 text-gray-400 hover:text-black text-xs underline flex items-center gap-1 z-10"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                PDF
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
                            <div className="space-y-4 pt-2">
                                {viewLevel !== 'weeks' && (
                                    <button onClick={handleBackHistory} className="mb-4 flex items-center gap-2 text-pink-600 font-bold text-lg">
                                        <ArrowLeft className="w-7 h-7" /> Zurück
                                    </button>
                                )}

                                {viewLevel === 'weeks' && (
                                    getWeeklyGroups().map((group, idx) => (
                                        <div key={idx} onClick={() => handleWeekClick(group.start)} className="flex justify-between items-center bg-transparent border-b-2 border-gray-100 py-3 cursor-pointer hover:bg-gray-50">
                                            <div>
                                                <p className="text-xl font-bold text-gray-800">KW {format(group.start, 'w', { locale: de })}</p>
                                                <p className="text-sm text-gray-400">{format(group.start, 'dd.MM.')} - {format(endOfWeek(group.start, { weekStartsOn: 1 }), 'dd.MM.yyyy')}</p>
                                            </div>
                                            <div className="text-xl font-bold text-gray-800">€{group.total.toFixed(2)}</div>
                                        </div>
                                    ))
                                )}
                                {viewLevel === 'days' && (
                                    getDailyGroups().map((group, idx) => (
                                        <div key={idx} onClick={() => handleDayClick(group.date)} className="flex justify-between items-center bg-transparent border-b-2 border-gray-100 py-3 cursor-pointer hover:bg-gray-50">
                                            <div className="flex items-center gap-3">
                                                <div className="text-xl font-bold text-gray-400">{format(group.date, 'dd.MM')}</div>
                                                <div className="text-lg font-bold text-gray-800">{format(group.date, 'EEEE', { locale: de })}</div>
                                            </div>
                                            <div className="text-xl font-bold text-gray-800">€{group.total.toFixed(2)}</div>
                                        </div>
                                    ))
                                )}
                                {viewLevel === 'transactions' && (
                                    getTransactions().map(expense => (
                                        <div key={expense.id} className="flex justify-between items-center bg-transparent border-b-2 border-gray-100 py-3">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="min-w-0">
                                                    <p className="text-lg font-bold text-gray-800 truncate">{expense.description}</p>
                                                    {expense.category && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{expense.category}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-lg font-bold text-red-500">-€{expense.amount.toFixed(2)}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setEditingExpense(expense)
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-500 bg-gray-50 rounded-lg"
                                                >
                                                    <Pencil className="w-6 h-6" />
                                                </button>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation()
                                                        if (confirm('Löschen?')) {
                                                            await deleteExpenseLocal(expense.id)
                                                        }
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg"
                                                >
                                                    <Trash2 className="w-6 h-6" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* === BOTTOM NAVIGATION BAR === */}
            <div className="fixed bottom-0 left-0 w-full bg-white/60 backdrop-blur-xl border-t border-white/40 pb-[env(safe-area-inset-bottom)] z-40 transition-all duration-300 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                <div className="flex justify-around items-center h-20 px-6">
                    <button
                        data-testid="nav-home"
                        onClick={() => setView('entry')}
                        className={`p-3 rounded-2xl transition-all duration-300 ${view === 'entry' ? 'bg-black text-white shadow-lg scale-110' : 'text-gray-400 hover:bg-black/5'}`}
                    >
                        <Home className="w-8 h-8" />
                    </button>

                    <button
                        data-testid="nav-history"
                        onClick={() => setView('history')}
                        className={`p-3 rounded-2xl transition-all duration-300 ${view === 'history' ? 'bg-black text-white shadow-lg scale-110' : 'text-gray-400 hover:bg-black/5'}`}
                    >
                        <List className="w-8 h-8" />
                    </button>

                    <button
                        data-testid="nav-settings"
                        onClick={() => setIsSettingsOpen(true)}
                        className={`p-3 rounded-2xl transition-all duration-300 ${isSettingsOpen ? 'bg-black text-white shadow-lg scale-110' : 'text-gray-400 hover:bg-black/5'}`}
                    >
                        <Settings className="w-8 h-8" />
                    </button>
                </div>
            </div>

        </div>
    )
}