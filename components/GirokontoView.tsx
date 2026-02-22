'use client'

import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, addDays, getYear, format, isSameDay, subYears } from 'date-fns'
import { de } from 'date-fns/locale'
import { calculateGirokontoTimeline } from '@/utils/girokonto'

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

    // --- DATA GENERATION (Using central girokonto.ts) ---
    const { chartData, currentBalance } = useMemo(() => {
        const result = calculateGirokontoTimeline(expenses, incomeSources, initialFixedCosts)

        // Filter the daily timeline specifically as requested (e.g. end of month only)
        const timeline = result.timeline

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
            const existingLabels = filteredData.map(d => d.label)
            const lastLabel = format(last.date, 'MMM yy', { locale: de })

            // Only add if we didn't already capture this month (or decide to overwrite it with the latest)
            if (!existingLabels.includes(lastLabel)) {
                filteredData.push({
                    label: lastLabel,
                    date: last.date,
                    info: format(last.date, 'MMMM yyyy', { locale: de }),
                    balance: Math.round(last.balance)
                })
            } else {
                // Update the last element to the very latest value of this month
                const lastEl = filteredData[filteredData.length - 1]
                if (lastEl) {
                    lastEl.balance = Math.round(last.balance)
                    lastEl.date = last.date
                }
            }
        }

        // --- ALIGNMENT FIX ---
        // Since MobileDashboard is passing exactly what calculateGirokontoTimeline returns,
        // targetBalance and simulatedEnd are identical. The offset is zero.
        // But we keep it to ensure chart matches the large number displayed.
        const simulatedEnd = result.finalBalance
        const offset = targetBalance - simulatedEnd

        // Apply offset to all points
        const alignedData = filteredData.map(d => ({
            ...d,
            balance: Math.round(d.balance + offset) // offset is expected to be 0 now
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
        <div className="fixed inset-0 bg-background z-50 overflow-y-auto animate-in slide-in-from-right duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex flex-col min-h-full pb-8">
                {/* HEAD */}
                <div className="p-6 md:pt-12 pb-2 shrink-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors px-2 py-4 -ml-2"
                    >
                        <ArrowLeft className="w-8 h-8" />
                        <span className="text-xl font-medium">Zurück</span>
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
                <div className="p-6 flex flex-col flex-1">
                    <div className="bg-card rounded-3xl p-4 border border-border h-[60vh] min-h-[500px] flex flex-col relative shadow-sm">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h3 className="font-bold text-muted-foreground text-sm uppercase">Verlauf</h3>
                            <div className="flex gap-1">
                                <button onClick={() => scroll('left')} className="p-2 rounded-full hover:bg-muted transition-colors"><ChevronLeft className="w-5 h-5 text-muted-foreground" /></button>
                                <button onClick={() => scroll('right')} className="p-2 rounded-full hover:bg-muted transition-colors"><ChevronRight className="w-5 h-5 text-muted-foreground" /></button>
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
