'use client'

import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts'
import { TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useRef, useLayoutEffect } from 'react'
import NetCashflowChart from './NetCashflowChart'

type Props = {
    data12M: any[]
    dataWeekly: any[]
    dataYearly: any[]
    dataDaily: any[]
    currency?: string
}

export default function CashflowTab({ data12M, dataWeekly, dataYearly, dataDaily, currency = '€' }: Props) {
    const [range, setRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Select Data based on Range
    let currentData = data12M
    let title = 'Letzte 12 Monate'
    let xDataKey = 'month'
    let pointWidth = 50 // Pixels per data point default

    switch (range) {
        case 'daily':
            currentData = dataDaily
            title = 'Täglicher Verlauf'
            xDataKey = 'month'
            pointWidth = 20
            break
        case 'weekly':
            currentData = dataWeekly
            title = 'Wöchentlicher Verlauf'
            pointWidth = 40
            break
        case 'yearly':
            currentData = dataYearly
            title = 'Jährlicher Verlauf'
            pointWidth = 60
            break
        case 'monthly':
        default:
            currentData = data12M
            title = 'Monatlicher Verlauf'
            pointWidth = 50
            break
    }

    // Auto-Scroll to the right (latest data) whenever data or range changes
    useLayoutEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth
        }
    }, [range, currentData])

    // Manual Scroll Handlers
    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 300 // px to scroll
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            })
        }
    }

    // Dynamic Chart Width
    // Min width 100% of container, otherwise calculated based on data points
    // We assume the parent container is fixed width (screen width).
    // Let's use a safe calc.
    // Calculate Max Value for Domain Synchronization
    const maxValue = Math.max(...currentData.map(d => Math.max(Number(d.income || 0), Number(d.expenses || 0), 100))) * 1.1
    const chartWidth = Math.max(500, currentData.length * pointWidth)

    return (
        <div className="space-y-6">

            {/* TIME RANGE SWITCHER */}
            <div className="flex bg-muted/70 p-1 rounded-xl">
                {['daily', 'weekly', 'monthly', 'yearly'].map((r) => (
                    <button
                        key={r}
                        onClick={() => setRange(r as any)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${range === r
                            ? 'bg-card shadow-sm text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {r === 'daily' && 'Täglich'}
                        {r === 'weekly' && 'Woche'}
                        {r === 'monthly' && 'Monat'}
                        {r === 'yearly' && 'Jahr'}
                    </button>
                ))}
            </div>

            {/* DYNAMIC TREND CHART (SPLIT LAYOUT) */}
            <div className="surface p-4 relative">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                            <TrendingUp className="w-4.5 h-4.5" strokeWidth={1.75} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">Verlauf</h3>
                            <p className="text-xs text-muted-foreground">{title}</p>
                        </div>
                    </div>

                    {/* SCROLL CONTROLS */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => scroll('left')}
                            className="press p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors duration-200"
                        >
                            <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            className="press p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors duration-200"
                        >
                            <ChevronRight className="w-5 h-5" strokeWidth={1.75} />
                        </button>
                    </div>
                </div>

                <div className="flex h-[250px] w-full">
                    {/* FIXED Y-AXIS LEFT */}
                    <div className="w-[60px] h-full shrink-0 border-r border-border bg-card z-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[{ val: 0 }, { val: maxValue }]} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: 'var(--text-muted-foreground)', fontWeight: '500' }}
                                    domain={[0, maxValue]}
                                    width={60}
                                    tickFormatter={(value) => { const v = Math.round(value); return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}` }}
                                />
                                <Bar dataKey="val" fill="transparent" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* SCROLLABLE CONTENT RIGHT */}
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 h-full overflow-x-auto overflow-y-hidden"
                        style={{ scrollBehavior: 'smooth' }}
                    >
                        <div style={{ width: `${chartWidth}px`, height: '100%', minWidth: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={currentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--chart-pos)" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="var(--chart-pos)" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--chart-neg)" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="var(--chart-neg)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                    <XAxis dataKey={xDataKey} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted-foreground)' }} dy={10} minTickGap={30} />
                                    {/* Hiden YAxis to maintain grid alignment structure if needed, but we use domain sync */}
                                    <YAxis hide domain={[0, maxValue]} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgb(35 22 26 / 0.08)', fontFamily: 'var(--font-geist-mono)' }}
                                        formatter={(value: any) => [`€${Number(value).toFixed(2)}`, '']}
                                    />
                                    <Area type="monotone" dataKey="income" stroke="var(--chart-pos)" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" name="Einnahmen" />
                                    <Area type="monotone" dataKey="expenses" stroke="var(--chart-neg)" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" name="Ausgaben" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. NET CASHFLOW (Dynamic) */}
            <NetCashflowChart data={currentData} />
        </div>
    )
}
