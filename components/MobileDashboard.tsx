'use client'

import { useState, useEffect } from 'react'
import { Wallet, TrendingDown, Calendar, ChevronRight, ArrowLeft, Settings, AlertCircle, Trash2, Plus, List, Pencil, X } from 'lucide-react'
import { startOfWeek, endOfWeek, format, isSameDay, isWithinInterval, differenceInCalendarWeeks, min } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/utils/supabase'
import { applyTheme } from '@/utils/theme'

import AddExpenseForm from './AddExpenseForm'
import SettingsOverlay from './SettingsOverlay'
import CalendarHistory from './CalendarHistory'
import AnalysisView from './AnalysisView'
import WeeklyBarChart from './WeeklyBarChart'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import { Expense, FixedCost, Settings as SettingsType, Account } from '@/app/types'

type MainView = 'entry' | 'history'

export default function MobileDashboard({
    expenses,
    initialBudget,
    initialFixedCosts,
    initialSettings,
    initialAccounts,
    onUpdate
}: {
    expenses: Expense[],
    initialBudget: number,
    initialFixedCosts: FixedCost[],
    initialSettings: SettingsType,
    initialAccounts: Account[],
    onUpdate?: () => void
}) {
    // --- APP STATE ---
    const [view, setView] = useState<MainView>('entry')
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [viewLevel, setViewLevel] = useState<'weeks' | 'days' | 'transactions'>('weeks')
    const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null)
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [historyMode, setHistoryMode] = useState<'calendar' | 'list' | 'analysis'>('calendar')

    const [theme, setTheme] = useState('white')
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

    // --- EFFECT: PROCESS SAVINGS ON MOUNT ---
    useEffect(() => {
        const processSavings = async () => {
            console.log('--- Processing Savings ---')
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
                const { error } = await supabase.from('settings').update({
                    monthly_budget: settings.monthly_budget + budgetIncrease
                }).eq('id', settings.id)

                if (error) console.error('Error updating settings:', error)
                else onUpdate?.()
            }
        }
        processSavings()
    }, [])

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
        await supabase.from('expenses').delete().eq('id', id)
        onUpdate?.()
    }

    const handleEditSave = async (formData: FormData) => {
        if (!editingExpense) return
        await updateExpenseLocal(editingExpense.id, formData)
        setEditingExpense(null)
    }

    // Budget Calculations
    const totalFixed = initialFixedCosts.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const availableMonthly = initialBudget - totalFixed
    const weeklyBudget = availableMonthly / 4
    const getDate = (e: Expense) => new Date(e.expense_date || e.created_at)

    const now = new Date()
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 })

    // Calculate Budget based on Total Weeks Passed since First Expense
    // Filter out 'Konto:' expenses from budget calculation?
    // Based on previous logic: e.category.startsWith('Konto:') excluded from accumulated budget logic?
    const relevantExpenses = expenses.filter(e => !e.category?.startsWith('Konto:'))
    const allDates = relevantExpenses.map(e => getDate(e))
    const firstExpenseDate = allDates.length > 0 ? min(allDates) : now
    const weeksPassed = differenceInCalendarWeeks(now, firstExpenseDate, { weekStartsOn: 1 })

    // Total Budget = (Weeks Passed + 1) * Weekly Budget
    const totalAccumulatedBudget = weeklyBudget * (weeksPassed + 1)

    const totalSpentRelevant = relevantExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const currentBalance = totalAccumulatedBudget - totalSpentRelevant
    const isPositive = currentBalance >= 0

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
        return Object.values(groups).sort((a, b) => a.start.getTime() - b.start.getTime())
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
        return Object.values(groups).sort((a, b) => a.date.getTime() - b.date.getTime())
    }
    const getTransactions = () => {
        if (!selectedDay) return []
        return expenses.filter(e => isSameDay(getDate(e), selectedDay))
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
                theme={theme}
                setTheme={setTheme}
                onLogout={handleLogout}
                onUpdate={onUpdate}
                expenses={expenses}
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
                        <X className="w-8 h-8" />
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
        <div className={`h-[100dvh] w-screen overflow-hidden relative transition-colors duration-300 ${getThemeBg()}`}>

            {/* === ENTRY VIEW === */}
            {view === 'entry' && (
                <div className="grid grid-cols-12 grid-rows-[repeat(14,minmax(0,1fr))] w-full h-full">

                    {/* BEREICH 1: Verfügbares Budget */}
                    <div className="row-start-1 row-span-4 col-start-3 col-span-4 flex flex-col justify-center items-center">
                        <h2 className="font-bold uppercase tracking-widest text-center text-2vh text-muted-foreground">
                            Verfügbar
                        </h2>
                        <div className={`font-bold tracking-tight leading-none text-center text-5vh ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            €{Math.floor(currentBalance)}<span className="text-3vh text-muted-foreground">.{(currentBalance % 1).toFixed(2).split('.')[1] || '00'}</span>
                        </div>
                    </div>

                    {/* BEREICH 2: Ausgaben diese Woche */}
                    <div className="row-start-1 row-span-4 col-start-8 col-span-4 flex flex-col justify-center items-center">
                        <div className="font-bold leading-none text-center text-4vh text-foreground">
                            test 2
                        </div>
                    </div>

                    {/* BEREICH 3: Eingabe-Panel */}
                    <div className="row-start-6 row-span-4 col-start-2 col-span-10 flex flex-col justify-evenly bg-white/90 backdrop-blur-md border border-white/40 rounded-2xl p-2 shadow-xl z-10 overflow-hidden">
                        <AddExpenseForm accounts={initialAccounts} onRefresh={onUpdate} />
                    </div>

                    {/* BEREICH 4: Historie Button */}
                    <div className="row-start-13 row-span-1 col-start-3 col-span-4">
                        <button
                            onClick={() => setView('history')}
                            className="w-full h-full bg-primary/90 text-primary-foreground backdrop-blur-md rounded-xl shadow-md flex items-center justify-center hover:bg-primary transition-all active:scale-95 border border-primary/20"
                        >
                            <List className="w-6 h-6 mr-2" />
                            <span className="font-bold text-2vh">Historie</span>
                        </button>
                    </div>

                    {/* BEREICH 5: Einstellungen */}
                    <div className="row-start-13 row-span-1 col-start-10 col-span-2 flex justify-center items-center">
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="bg-gray-200 text-gray-700 p-3 rounded-full hover:bg-gray-300 transition-colors shadow-sm"
                        >
                            <Settings className="w-6 h-6" />
                        </button>
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
                            <ArrowLeft className="w-8 h-8" />
                            <span className="font-bold text-xl hidden sm:inline">Zurück</span>
                        </button>
                    </div>

                    {/* BEREICH 2: Reiter */}
                    <div className="row-start-2 row-span-1 col-start-4 col-span-6 flex justify-around items-center bg-white rounded-lg border border-black text-xs shadow-sm overflow-hidden p-1">
                        <button
                            onClick={() => setHistoryMode('calendar')}
                            className={`flex-1 text-center py-2 rounded-md font-bold transition-colors ${historyMode === 'calendar' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            Kalender
                        </button>
                        <button
                            onClick={() => setHistoryMode('list')}
                            className={`flex-1 text-center py-2 rounded-md font-bold transition-colors ${historyMode === 'list' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            Liste
                        </button>
                        <button
                            onClick={() => setHistoryMode('analysis')}
                            className={`flex-1 text-center py-2 rounded-md font-bold transition-colors ${historyMode === 'analysis' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            Analyse
                        </button>
                    </div>

                    {/* BEREICH 3: Inhalt */}
                    <div className="row-start-3 row-span-12 col-start-1 col-span-12 bg-white rounded-t-3xl p-4 overflow-y-auto shadow-[0_-5px_20px_rgba(0,0,0,0.1)] relative border-t border-gray-100">
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
                            <AnalysisView expenses={expenses} />
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
                                        <ArrowLeft className="w-5 h-5" /> Zurück
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
                                                    <Pencil className="w-4 h-4" />
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
                                                    <Trash2 className="w-4 h-4" />
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

        </div>
    )
}