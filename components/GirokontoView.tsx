'use client'

import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
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
    const { chartData, currentBalance, splitOffset } = useMemo(() => {
        const result = calculateGirokontoTimeline(expenses, incomeSources, initialFixedCosts)

        // Show daily data instead of filtering to month-end
        const filteredData = result.timeline.map((t: any) => ({
            label: format(t.date, 'dd.MM', { locale: de }),
            date: t.date,
            info: format(t.date, 'dd. MMMM yyyy', { locale: de }),
            balance: Math.round(t.balance)
        }))

        // --- ALIGNMENT FIX ---
        // Since MobileDashboard is passing exactly what calculateGirokontoTimeline returns,
        // targetBalance and simulatedEnd are identical. The offset is zero.
        // But we keep it to ensure chart matches the large number displayed.
        const simulatedEnd = result.finalBalance
        const offset = targetBalance - simulatedEnd

        // Apply offset to all points
        const alignedData = filteredData.map((d: any) => ({
            ...d,
            balance: Math.round(d.balance + offset) // offset is expected to be 0 now
        }))

        // Calculate splitOffset for red/green gradient
        const maxBalance = Math.max(...alignedData.map((d: any) => d.balance), 1)
        const minBalance = Math.min(...alignedData.map((d: any) => d.balance), 0)
        
        let split = 0
        if (maxBalance <= 0) {
            split = 0
        } else if (minBalance >= 0) {
            split = 1
        } else {
            split = maxBalance / (maxBalance - minBalance)
        }

        return { chartData: alignedData, currentBalance: targetBalance, splitOffset: split }
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

    // Dynamic Width (Fit ~1 month per screen)
    const pointWidth = 20
    const chartWidth = Math.max(500, chartData.length * pointWidth)

    // Colors
    const isPositive = (currentBalance || 0) >= 0

    return (
        <div className="fixed inset-0 bg-background z-50 overflow-y-auto animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex flex-col min-h-full pb-8 max-w-2xl mx-auto w-full">
                {/* HEAD */}
                <div className="p-6 md:pt-12 pb-2 shrink-0">
                    <button
                        onClick={onBack}
                        className="press flex items-center gap-1.5 text-muted-foreground hover:text-foreground mb-8 transition-colors duration-200 py-2 -ml-1"
                    >
                        <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                        <span className="text-sm font-medium">Zurück</span>
                    </button>

                    <div className="flex items-end justify-between">
                        <div>
                            <p className="eyebrow mb-3">Girokonto</p>
                            <h1 className={`amount text-5xl font-light ${isPositive ? 'text-foreground' : 'text-[var(--chart-neg-heavy)]'}`}>
                                €{currentBalance.toFixed(2)}
                            </h1>
                        </div>
                        <div className={`p-3 rounded-xl ${isPositive ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg)]/10 text-[var(--chart-neg-heavy)]'}`}>
                            <TrendingUp className="w-6 h-6" strokeWidth={1.75} />
                        </div>
                    </div>
                </div>

                {/* CONTROLS REMOVED */}

                {/* CHART */}
                <div className="p-6 flex flex-col flex-1">
                    <div className="surface p-4 h-[60vh] min-h-[500px] flex flex-col relative">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h3 className="eyebrow">Verlauf</h3>
                            <div className="flex gap-1">
                                <button onClick={() => scroll('left')} className="press p-2 rounded-full hover:bg-muted transition-colors duration-200"><ChevronLeft className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} /></button>
                                <button onClick={() => scroll('right')} className="press p-2 rounded-full hover:bg-muted transition-colors duration-200"><ChevronRight className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} /></button>
                            </div>
                        </div>

                        <div ref={scrollContainerRef} className="flex-1 w-full overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
                            <div style={{ width: `${chartWidth}px`, height: '100%', minWidth: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset={splitOffset} stopColor="var(--chart-pos)" stopOpacity={0.9} />
                                                <stop offset={splitOffset} stopColor="var(--chart-neg)" stopOpacity={0.9} />
                                            </linearGradient>
                                            <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset={splitOffset} stopColor="var(--chart-pos)" stopOpacity={0.15} />
                                                <stop offset={splitOffset} stopColor="var(--chart-neg)" stopOpacity={0.15} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted-foreground)' }} dy={10} minTickGap={30} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted-foreground)' }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgb(35 22 26 / 0.08)', fontFamily: 'var(--font-geist-mono)' }}
                                            labelStyle={{ color: 'var(--text-muted-foreground)', marginBottom: '0.25rem' }}
                                            labelFormatter={(label, payload) => payload?.[0]?.payload?.info || label}
                                            formatter={(value: any) => [`€${Number(value).toFixed(2)}`, 'Girokonto']}
                                        />
                                        <ReferenceLine y={0} stroke="var(--chart-neg)" strokeDasharray="3 3" opacity={0.5} />
                                        <Area
                                            type="monotone"
                                            dataKey="balance"
                                            stroke="url(#splitColor)"
                                            strokeWidth={3}
                                            fill="url(#splitFill)"
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
