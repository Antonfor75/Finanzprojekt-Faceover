'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar } from 'recharts'

import CashflowTab from './analysis/CashflowTab'
import StructureTab from './analysis/StructureTab'
import WealthTab from './analysis/WealthTab'
import { startOfWeek, endOfWeek, isWithinInterval, eachDayOfInterval, format, isSameDay, getDay, subWeeks, getISOWeek } from 'date-fns'
import { de } from 'date-fns/locale'

import { Expense, FixedCost, Account } from '@/app/types'

type Props = {
    expenses: Expense[]
    budget: number
    fixedCosts: FixedCost[]
    accounts: Account[]
}

const COLORS = ['#FF8042', '#0088FE', '#00C49F', '#FFBB28', '#8884d8', '#ffc658', '#82ca9d']
const CATEGORY_COLORS: Record<string, string> = {
    'Essen': '#F59E0B',      // Amber
    'Miete': '#3B82F6',      // Blue
    'Transport': '#8B5CF6',  // Violet
    'Freizeit': '#EC4899',   // Pink
    'Versicherung': '#6B7280', // Gray
    'Sparen': '#10B981',     // Emerald
    'Sonstiges': '#9CA3AF'   // Light Gray
}

// Helper for wealth calculation
const getMonthKey = (date: Date) => format(date, 'yyyy-MM')

export default function AnalysisView({ expenses, budget, fixedCosts, accounts }: Props) {
    const [activeTab, setActiveTab] = useState<'daily' | 'cashflow' | 'structure' | 'wealth'>('cashflow')
    const [cashflowRange, setCashflowRange] = useState<'12m' | '4w'>('12m')

    const { pieData, graphData, total, gradientOffset, cashflowData12M, cashflowData4W, structureData, topCategories, wealthData } = useMemo(() => {
        const now = new Date()
        const currentMonthKey = getMonthKey(now)

        // --- 1. DAILY / WEEKLY DATA (Existing Logic) ---
        const start = startOfWeek(now, { weekStartsOn: 1 })
        const end = endOfWeek(now, { weekStartsOn: 1 })

        const currentWeekExpenses = expenses.filter(e => {
            const date = new Date(e.expense_date || e.created_at)
            return isWithinInterval(date, { start, end })
        })

        // Pie Data (Categories) for Daily Tab
        const groups: Record<string, number> = {}
        currentWeekExpenses.forEach(e => {
            const cat = e.category || 'Sonstiges'
            groups[cat] = (groups[cat] || 0) + Number(e.amount)
        })

        const pieData = Object.entries(groups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)

        const totalW = pieData.reduce((acc, curr) => acc + Number(curr.value), 0)

        // Graph Data (Cumulative) for Daily Tab
        const days = eachDayOfInterval({ start, end })
        let cumulative = 0
        const graphData = days.map(day => {
            const dayExpenses = currentWeekExpenses.filter(e => isSameDay(new Date(e.expense_date || e.created_at), day))
            const dayTotal = dayExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0)
            cumulative += dayTotal

            const categoryBreakdown: Record<string, number> = {}
            dayExpenses.forEach(e => {
                const cat = e.category || 'Sonstiges'
                categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Number(e.amount)
            })

            return {
                day: format(day, 'EEE', { locale: de }),
                amount: cumulative,
                dailyTotal: dayTotal,
                fullDate: day,
                ...categoryBreakdown
            }
        })

        // Gradient Offset Logic
        const maxVal = Math.max(...graphData.map(d => d.amount))
        // If Max > Budget: Split is at Budget.
        const gradientOffset = (budget > 0 && maxVal > budget) ? (maxVal - budget) / maxVal : 0


        // --- 2. CASHFLOW DATA ---
        // 12 Months Logic
        const cashflowData12M: any[] = []
        const expensesByMonth: Record<string, number> = {}
        expenses.forEach(e => {
            const date = new Date(e.expense_date || e.created_at)
            const key = getMonthKey(date)
            expensesByMonth[key] = (expensesByMonth[key] || 0) + Number(e.amount)
        })

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const key = getMonthKey(d)
            const monthLabel = format(d, 'MMM', { locale: de })

            const income = budget
            const expense = expensesByMonth[key] || 0
            const savings = income - expense
            const rate = income > 0 ? (savings / income) * 100 : 0

            cashflowData12M.push({
                month: monthLabel,
                fullDate: key,
                income: income,
                expenses: expense,
                savingsRate: Math.max(-100, Math.min(100, rate))
            })
        }

        // 4 Weeks Logic
        const cashflowData4W: any[] = []
        for (let i = 3; i >= 0; i--) {
            const d = subWeeks(now, i)
            const start = startOfWeek(d, { weekStartsOn: 1 })
            const end = endOfWeek(d, { weekStartsOn: 1 })
            const rangeLabel = `${format(start, 'dd.MM')} - ${format(end, 'dd.MM')}`

            const weeklyIncome = budget / 4.33

            const weeklyExpenses = expenses.filter(e => {
                const ed = new Date(e.expense_date || e.created_at)
                return isWithinInterval(ed, { start, end })
            }).reduce((acc, curr) => acc + Number(curr.amount), 0)

            const savings = weeklyIncome - weeklyExpenses
            const rate = weeklyIncome > 0 ? (savings / weeklyIncome) * 100 : 0

            cashflowData4W.push({
                month: rangeLabel,
                fullDate: rangeLabel,
                income: weeklyIncome,
                expenses: weeklyExpenses,
                savingsRate: Math.max(-100, Math.min(100, rate))
            })
        }

        // --- 3. STRUCTURE DATA (Current Month) ---
        const totalFixed = fixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0)

        const currentMonthVariable = expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at)
            return getMonthKey(d) === currentMonthKey
        }).reduce((acc, e) => acc + Number(e.amount), 0)

        const fixVsVarData = [
            {
                month: format(now, 'MMM', { locale: de }),
                fix: totalFixed,
                var: currentMonthVariable
            }
        ]

        // Top Categories (Current Month)
        const catMap: Record<string, number> = {}
        expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at)
            return getMonthKey(d) === currentMonthKey
        }).forEach(e => {
            const cat = e.category || 'Sonstiges'
            catMap[cat] = (catMap[cat] || 0) + Number(e.amount)
        })

        const topCategories = Object.entries(catMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)

        // --- 4. WEALTH DATA (Net Worth over Time) ---
        let startDate = new Date()
        if (expenses.length > 0) {
            const dates = expenses.map(e => new Date(e.expense_date || e.created_at).getTime())
            startDate = new Date(Math.min(...dates))
        } else {
            startDate.setMonth(startDate.getMonth() - 6)
        }
        startDate.setDate(1) // Start of month

        const initialWealth = accounts.reduce((acc, a) => acc + Number(a.amount), 0)

        const monthlySavingsMap: Record<string, number> = {}
        const tempDate = new Date(startDate)
        const allMonths: string[] = []

        const loopEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        while (tempDate <= loopEnd) {
            allMonths.push(getMonthKey(tempDate))
            tempDate.setMonth(tempDate.getMonth() + 1)
        }

        allMonths.forEach(mKey => {
            const exp = expensesByMonth[mKey] || 0
            const save = budget - totalFixed - exp
            monthlySavingsMap[mKey] = save
        })

        const wealthSeries = []
        let runningWealth = initialWealth

        // Backwards calculation from NOW (Known Wealth)
        for (let i = allMonths.length - 1; i >= 0; i--) {
            const mKey = allMonths[i]
            const mDate = new Date(mKey + '-01')

            wealthSeries.unshift({
                year: format(mDate, 'MMM yy', { locale: de }),
                monthKey: mKey,
                assets: runningWealth,
                debt: 0
            })

            // Previous wealth was Current - Savings (Approximation)
            runningWealth -= monthlySavingsMap[mKey]
        }

        return {
            pieData,
            graphData,
            total: totalW,
            gradientOffset,
            cashflowData12M,
            cashflowData4W,
            structureData: fixVsVarData,
            topCategories,
            wealthData: wealthSeries
        }
    }, [expenses, budget, fixedCosts, accounts])

    return (
        <div className="flex flex-col h-full bg-white dark:bg-transparent rounded-t-3xl overflow-hidden shadow-[0_-5px_20px_rgba(0,0,0,0.05)] border-t border-gray-100 dark:border-white/5 pb-20">
            {/* --- HEADER & TABS --- */}
            <div className="pt-2 px-2 shrink-0 bg-white dark:bg-transparent z-10">

                {/* Upper Stats Row */}
                <div className="flex justify-between items-end mb-4 px-2">
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gesamt (Woche)</p>
                        <h2 className="text-3xl font-black text-gray-800 dark:text-white">€{total.toFixed(2)}</h2>
                    </div>
                    {/* Tiny Pie Chart Icon/Preview */}
                    <div className="h-10 w-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="value" outerRadius={18} innerRadius={10} stroke="none">
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || '#9CA3AF'} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl flex overflow-x-auto no-scrollbar gap-1">
                    {[
                        { id: 'daily', label: 'Daily' },
                        { id: 'cashflow', label: 'Cashflow' },
                        { id: 'structure', label: 'Struktur' },
                        { id: 'wealth', label: 'Vermögen' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap px-3 ${activeTab === tab.id
                                ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- SCROLLABLE CONTENT --- */}
            <div className="flex-1 overflow-y-auto p-4 space-y-8">

                {/* --- TAB CONTENT --- */}
                {activeTab === 'cashflow' && <CashflowTab data12M={cashflowData12M} data4W={cashflowData4W} />}
                {activeTab === 'structure' && <StructureTab fixVsVarData={structureData} topCatsData={topCategories} />}
                {activeTab === 'wealth' && <WealthTab data={wealthData} />}

                {activeTab === 'daily' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
                        <h3 className="text-sm font-bold text-center text-gray-400 uppercase tracking-widest mt-2">Wochen-Detail</h3>

                        {/* --- GRAPH SECTION --- */}
                        <div className="h-[250px] w-full bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 rounded-2xl shadow-sm border border-gray-100 p-2">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 ml-2">Verlauf vs. Budget</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <AreaChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.2} />
                                            <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={0.2} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 'bold' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: any) => [`€${Number(value || 0).toFixed(2)}`, 'Kumulativ']}
                                    />
                                    <ReferenceLine y={budget} stroke="#9CA3AF" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Wochenbudget', fill: '#9CA3AF', fontSize: 10 }} />
                                    <Area type="monotone" dataKey="amount" stroke="#000" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* --- DAILY BAR CHART SECTION --- */}
                        <div className="h-[250px] w-full bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 rounded-2xl shadow-sm border border-gray-100 p-2">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 ml-2">Tägliche Ausgaben</h3>
                            <ResponsiveContainer width="100%" height="90%">
                                <BarChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 'bold' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="dailyTotal" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Ausgaben" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* --- PIE CHART SECTION --- */}
                        <div className="w-full h-[400px]">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 ml-2">Kategorien</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || '#9CA3AF'} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Legend
                                        verticalAlign="bottom"
                                        height={36}
                                        iconType="circle"
                                        formatter={(value, entry: any) => <span className="text-gray-600 dark:text-gray-400 font-medium text-xs ml-1">{value}</span>}
                                    />
                                    <Tooltip
                                        formatter={(value: any) => `€${Number(value).toFixed(2)}`}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* --- TABLE SECTION --- */}
                        <div className="bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                            <div className="flex justify-between items-center font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">
                                <span>Gesamt</span>
                                <span>€{total.toFixed(2)}</span>
                            </div>
                            <div className="divide-y divide-gray-200 dark:divide-white/10">
                                {pieData.map((entry, idx) => (
                                    <div key={idx} className="flex justify-between py-2 items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[entry.name] || '#9CA3AF' }} />
                                            <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">{entry.name}</span>
                                        </div>
                                        <span className="text-gray-800 dark:text-gray-200 font-bold">€{entry.value.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
