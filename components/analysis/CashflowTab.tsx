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
            <div className="flex bg-primary/10 p-1 rounded-xl">
                {['daily', 'weekly', 'monthly', 'yearly'].map((r) => (
                    <button
                        key={r}
                        onClick={() => setRange(r as any)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${range === r
                            ? 'bg-card shadow-sm text-primary'
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
            <div className="bg-card p-4 rounded-2xl shadow-sm border border-border relative">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800">Verlauf</h3>
                            <p className="text-xs text-gray-400">{title}</p>
                        </div>
                    </div>

                    {/* SCROLL CONTROLS */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => scroll('left')}
                            className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 active:scale-95 transition-all"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 active:scale-95 transition-all"
                        >
                            <ChevronRight className="w-5 h-5" />
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
                                    tick={{ fontSize: 10, fill: '#6B7280', fontWeight: '500' }} // Increased contrast
                                    domain={[0, maxValue]}
                                    width={60}
                                    tickFormatter={(value) => `${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
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
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey={xDataKey} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} dy={10} minTickGap={30} />
                                    {/* Hiden YAxis to maintain grid alignment structure if needed, but we use domain sync */}
                                    <YAxis hide domain={[0, maxValue]} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: any) => [`€${Number(value).toFixed(2)}`, '']}
                                    />
                                    <Area type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" name="Einnahmen" />
                                    <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" name="Ausgaben" />
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
