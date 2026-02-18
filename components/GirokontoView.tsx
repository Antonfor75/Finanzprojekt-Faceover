'use client'

import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, addDays, getYear, format, isSameDay, subYears } from 'date-fns'
import { de } from 'date-fns/locale'

type Props = {
    expenses: any[]
    incomeSources: any[]
    initialFixedCosts: any[]
    currentGiroBalance: number // New Prop
    onBack: () => void
}

export default function GirokontoView({ expenses, incomeSources, initialFixedCosts, currentGiroBalance: targetBalance, onBack }: Props) {
    const range = 'monthly' // Forced to Monthly as per user request
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // --- DATA GENERATION (Similar to AnalysisView but for Balance) ---
    const { chartData, currentBalance } = useMemo(() => {
        // 1. Determine Start Date (Earliest transaction)
        let earliestDate = subYears(new Date(), 1)
        if (expenses.length > 0) {
            const dates = expenses.map(e => new Date(e.expense_date || e.created_at).getTime())
            const minDate = new Date(Math.min(...dates))
            if (minDate < earliestDate) earliestDate = minDate
        }
        if (incomeSources.length > 0) {
            const dates = incomeSources.filter(src => src.valid_from).map(src => new Date(src.valid_from).getTime())
            if (dates.length > 0) {
                const minDate = new Date(Math.min(...dates))
                if (minDate < earliestDate) earliestDate = minDate
            }
        }
        const now = new Date()
        if (earliestDate > now) earliestDate = subYears(now, 1)

        // Generate data points based on range
        // We need a running total calculation.
        // Easiest is to simulate day-by-day from earliestDate and pick points.

        let balance = 0
        const dataPoints = []

        // Simulation resolution: Daily is best for accuracy, then sample for graph.
        // Actually, let's just generate the requested points (daily/weekly/etc) 
        // by calculating the cumulative balance AT that point in time.

        // Helper to get balance at specific date
        const getBalanceAtDate = (date: Date) => {
            // This is heavy if called many times. Better to iterate.
            return 0
        }

        // Iterative approach:
        // Create full daily timeline from earliestDate to now.
        // --- SIMULATION LOGIC: WEEKLY BUDGET MODEL ---
        // User Logic: "Girokonto is calculated from what remains at end of week... added to it"
        // Interpretation: 
        // 1. Every Monday, "Weekly Budget" becomes available (Income - Fixed / 4.33).
        // 2. Expenses reduce this amount.
        // 3. The running total is the Girokonto balance.

        const timeline: { date: Date, balance: number }[] = []

        // Group expenses by day
        const expensesByDay: Record<string, number> = {}
        expenses.forEach(e => {
            const key = format(new Date(e.expense_date || e.created_at), 'yyyy-MM-dd')
            expensesByDay[key] = (expensesByDay[key] || 0) + Number(e.amount)
        })

        // Pre-calculate Total Monthly Fixed Costs
        const totalFixedMonthly = initialFixedCosts.reduce((acc: number, fc: any) => acc + Number(fc.amount), 0)

        // Simulation Loop
        let simDate = new Date(earliestDate)
        // Ensure we start on a Monday to have a valid budget cycle?
        // Actually, if we start mid-week, the bucket is 0, so expenses will hit Giro immediately.
        // This is acceptable for deep history.

        simDate.setHours(0, 0, 0, 0)
        const endDate = new Date()
        endDate.setHours(23, 59, 59, 999)

        let runningBalance = 0
        let currentWeeklyBucket = 0

        while (simDate <= endDate) {
            const dayKey = format(simDate, 'yyyy-MM-dd')
            const dayOfWeek = simDate.getDay() // 0=Sun, 1=Mon

            // 1. MONDAY: NEW WEEKLY BUDGET (Refill Bucket)
            // Note: In this model, the "Weekly Budget" sits in a separate bucket.
            // It does NOT hit the Girokonto yet.
            if (dayOfWeek === 1) {
                const activeMonthlyIncome = incomeSources.reduce((sum: number, src: any) => {
                    const from = src.valid_from ? new Date(src.valid_from) : null
                    const to = src.valid_to ? new Date(src.valid_to) : null
                    if (from && simDate < from) return sum
                    if (to && simDate > to) return sum

                    switch (src.frequency) {
                        case 'monthly': return sum + Number(src.amount)
                        case 'weekly': return sum + (Number(src.amount) * 4.33)
                        case 'yearly': return sum + (Number(src.amount) / 12)
                        case 'daily': return sum + (Number(src.amount) * 30.4)
                        default: return sum + Number(src.amount)
                    }
                }, 0)

                // Reset Bucket to new Weekly Allowance
                const weeklyAllowance = (activeMonthlyIncome - totalFixedMonthly) / 4.33
                currentWeeklyBucket = weeklyAllowance
            }

            // 2. DAILY EXPENSES
            const dayExpenses = expensesByDay[dayKey] || 0
            if (dayExpenses > 0) {
                const oldBucket = currentWeeklyBucket
                currentWeeklyBucket -= dayExpenses

                // Did we overspend the bucket?
                // If yes, the overflow hits the Girokonto.
                if (currentWeeklyBucket < 0) {
                    let deductionFromGiro = 0
                    if (oldBucket > 0) {
                        // We just went from positive to negative. 
                        // Only the amount BELOW zero is taken from Giro.
                        deductionFromGiro = -currentWeeklyBucket
                    } else {
                        // We were already negative (or zero). Full expense comes from Giro.
                        deductionFromGiro = dayExpenses
                    }
                    runningBalance -= deductionFromGiro
                }
            }

            // 3. ONE-TIME INCOME (Direct to Giro)
            const oneTimeIncome = incomeSources.reduce((sum: number, src: any) => {
                if (src.frequency === 'one_time' || !src.frequency) {
                    const validFrom = src.valid_from ? new Date(src.valid_from) : null
                    if (validFrom && isSameDay(validFrom, simDate)) {
                        return sum + Number(src.amount)
                    }
                }
                return sum
            }, 0)
            runningBalance += oneTimeIncome

            // 4. SUNDAY: SAVE SURPLUS
            // If the week ends and we still have money in the bucket, it goes to Giro.
            if (dayOfWeek === 0) {
                if (currentWeeklyBucket > 0) {
                    runningBalance += currentWeeklyBucket
                    // Transfer complete. Bucket technically empty (or just ignored until Monday reset)
                    currentWeeklyBucket = 0
                }
            }

            timeline.push({ date: new Date(simDate), balance: runningBalance })
            simDate = addDays(simDate, 1)
        }

        // Now sample/aggregate for the view (MONTHLY ONLY)
        const filteredData = timeline.filter(t => isSameDay(t.date, endOfMonth(t.date)))
            .map(t => ({
                label: format(t.date, 'MMM yy', { locale: de }),
                date: t.date,
                info: format(t.date, 'MMMM yyyy', { locale: de }),
                balance: Math.round(t.balance)
            }))

        // Ensure last day is included
        const last = timeline[timeline.length - 1]
        if (last && !isSameDay(last.date, endOfMonth(last.date))) {
            filteredData.push({
                label: format(last.date, 'MMM yy', { locale: de }),
                date: last.date,
                info: format(last.date, 'MMMM yyyy', { locale: de }),
                balance: Math.round(last.balance)
            })
        }

        // --- ALIGNMENT FIX ---
        // The simulation starts at 0. The actual current balance (targetBalance) is likely different.
        // We calculate the difference and shift the whole graph so the END matches the Target.
        const simulatedEnd = runningBalance
        const offset = targetBalance - simulatedEnd

        // Apply offset to all points
        const alignedData = filteredData.map(d => ({
            ...d,
            balance: Math.round(d.balance + offset)
        }))

        return { chartData: alignedData, currentBalance: targetBalance }
    }, [expenses, incomeSources, initialFixedCosts, targetBalance]) // Added targetBalance dependency

    // Auto-Scroll (same as CashflowTab)
    useLayoutEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth
        }
    }, [chartData])

    // Manual Scroll
    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const amount = 300
            scrollContainerRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
        }
    }

    // Dynamic Width (Fixed for Monthly)
    const pointWidth = 50
    const chartWidth = Math.max(500, chartData.length * pointWidth)

    // Colors
    const isPositive = (currentBalance || 0) >= 0

    return (
        <div className="fixed inset-0 bg-rose-50 z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex flex-col min-h-full pb-8">
                {/* HEAD */}
                <div className="p-6 pb-2 shrink-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-gray-500 hover:text-rose-600 mb-6 transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                        <span className="text-lg font-medium">Zurück</span>
                    </button>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold uppercase text-gray-400 tracking-wider">Girokonto Übersicht</p>
                            <h1 className={`text-4xl font-bold ${isPositive ? 'text-gray-900' : 'text-red-600'}`}>
                                €{currentBalance.toFixed(2)}
                            </h1>
                        </div>
                        <div className={`p-4 rounded-2xl ${isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            <TrendingUp className="w-8 h-8" />
                        </div>
                    </div>
                </div>

                {/* CONTROLS REMOVED */}

                {/* CHART */}
                <div className="p-6 flex flex-col">
                    <div className="bg-white/50 rounded-3xl p-4 border border-rose-100/20 h-[60vh] min-h-[500px] flex flex-col relative">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h3 className="font-bold text-gray-500 text-sm uppercase">Verlauf</h3>
                            <div className="flex gap-1">
                                <button onClick={() => scroll('left')} className="p-2 rounded-full hover:bg-rose-100 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                                <button onClick={() => scroll('right')} className="p-2 rounded-full hover:bg-rose-100 transition-colors"><ChevronRight className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div ref={scrollContainerRef} className="flex-1 w-full overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
                            <div style={{ width: `${chartWidth}px`, height: '100%', minWidth: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} dy={10} minTickGap={50} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ color: '#6b7280', marginBottom: '0.25rem' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="balance"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            fill="url(#colorBal)"
                                            name="Kontostand"
                                            animationDuration={500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
