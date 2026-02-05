'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar } from 'recharts'
import { startOfWeek, endOfWeek, isWithinInterval, eachDayOfInterval, format, isSameDay, getDay } from 'date-fns'
import { de } from 'date-fns/locale'

import { Expense } from '@/app/types'

type Props = {
    expenses: Expense[]
    budget: number
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

export default function AnalysisView({ expenses, budget }: Props) {
    const { pieData, graphData, total, gradientOffset } = useMemo(() => {
        const now = new Date()
        const start = startOfWeek(now, { weekStartsOn: 1 })
        const end = endOfWeek(now, { weekStartsOn: 1 })

        // 1. Filter Expenses
        const currentWeekExpenses = expenses.filter(e => {
            const date = new Date(e.expense_date || e.created_at)
            return isWithinInterval(date, { start, end })
        })

        // 2. Pie Data (Categories)
        const groups: Record<string, number> = {}
        currentWeekExpenses.forEach(e => {
            const cat = e.category || 'Sonstiges'
            groups[cat] = (groups[cat] || 0) + Number(e.amount)
        })

        const pieData = Object.entries(groups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)

        const total = pieData.reduce((acc, curr) => acc + Number(curr.value), 0)

        // 3. Graph Data (Cumulative)
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

        // 4. Gradient Offset
        const maxVal = Math.max(...graphData.map(d => d.amount))
        // Avoid division by zero if maxVal is 0, though budget usually > 0. 
        // If maxVal > budget, we want split. If maxVal <= budget, everything is green (offset 0).
        // Wait, stops are:
        // offset 0 (top): Color A
        // offset 1 (bottom): Color B
        // Recharts Y-Axis goes Bottom-Up? No, SVG coords. 
        // Usually Recharts LinearGradient: x1, y1 (0,0) to x2, y2 (0,1) is Top to Bottom.
        // Value High (Top) -> Value Low (Bottom).

        // If Budget line is at Y=B. 
        // We want Red ABOVE budget, Green BELOW budget.
        // Gradient: Top (High Val) -> Red ... Split Point -> Green ... Bottom (Low Val).

        // Range: [0, Max]. 
        // If Max > Budget: Split is at Budget.
        // Offset = (Max - Budget) / (Max - 0) = (Max - Budget) / Max.
        // Top (0%) is Max. Bottom (100%) is 0. 
        // Point Budget is at (Max - Budget) from Top?
        // Let's trace: 
        //   y=Max -> 0%
        //   y=Budget -> ? 
        //   y=0 -> 100%
        // Distance from Top = (Max - Budget).
        // Percentage = (Max - Budget) / Max.

        let offset = 0
        if (maxVal <= budget) {
            offset = 0 // Everything below budget -> Green? 
            // If offset is 0, gradient stop at 0. 
            // If we define Red at 0, Green at 1.
            // Split at 0 means all Green?
            // Actually if max <= budget, we don't need red.
        } else {
            offset = (maxVal - budget) / maxVal
        }

        return { pieData, graphData, total, gradientOffset: offset }
    }, [expenses, budget])

    const dailyBudget = budget / 7

    if (total === 0 && budget === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="text-xl font-bold">Keine Daten</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col space-y-6 pb-20">
            <h2 className="text-2xl font-bold text-center">Wochenanalyse</h2>

            {/* --- GRAPH SECTION --- */}
            <div className="h-[250px] w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-2">
                <h3 className="text-sm font-bold text-gray-500 mb-2 ml-2">Verlauf vs. Budget</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={1} />
                                <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={1} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                        <Tooltip
                            formatter={(value: any) => `€${Number(value).toFixed(2)}`}
                            labelStyle={{ color: '#374151', fontWeight: 'bold' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <ReferenceLine y={budget} stroke="#374151" strokeDasharray="3 3" label={{ value: 'Budget', fill: '#374151', fontSize: 10, position: 'insideTopLeft' }} />
                        <Area
                            type="monotone"
                            dataKey="amount"
                            stroke="#000"
                            strokeWidth={2}
                            fill="url(#splitColor)"
                            name="Ausgaben"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* --- DAILY BAR CHART SECTION --- */}
            <div className="h-[250px] w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-2">
                <h3 className="text-sm font-bold text-gray-500 mb-2 ml-2">Tägliche Ausgaben</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                        <Tooltip
                            formatter={(value: any) => `€${Number(value).toFixed(2)}`}
                            cursor={{ fill: '#F3F4F6' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <ReferenceLine y={dailyBudget} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Ø Limit', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }} />
                        <Bar dataKey="dailyTotal" radius={[4, 4, 0, 0]} name="Tagessumme">
                            {graphData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.dailyTotal > dailyBudget ? '#ef4444' : '#22c55e'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* --- STACKED BAR CHART SECTION --- */}
            <div className="h-[250px] w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-2">
                <h3 className="text-sm font-bold text-gray-500 mb-2 ml-2">Kategorien pro Tag</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={graphData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                        <Tooltip
                            formatter={(value: any, name: any) => [`€${Number(value).toFixed(2)}`, name]}
                            cursor={{ fill: '#F3F4F6' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        {Object.keys(CATEGORY_COLORS).map((cat) => (
                            <Bar key={cat} dataKey={cat} stackId="a" fill={CATEGORY_COLORS[cat]} radius={[0, 0, 0, 0]} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* --- PIE CHART SECTION --- */}
            <div className="w-full h-[400px]">
                <h3 className="text-sm font-bold text-gray-500 mb-2 ml-2">Kategorien</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {pieData.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={CATEGORY_COLORS[entry.name] || COLORS[index % COLORS.length]}
                                    stroke="none"
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: any) => `€${Number(value).toFixed(2)}`}
                            contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* --- TABLE SECTION --- */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex justify-between items-center font-bold text-lg mb-2 text-gray-800">
                    <span>Gesamt</span>
                    <span>€{total.toFixed(2)}</span>
                </div>
                <div className="space-y-3">
                    {pieData.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm font-medium text-gray-600">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[item.name] || COLORS[idx % COLORS.length] }}></div>
                                <span>{item.name}</span>
                            </div>
                            <span>{((item.value / (total || 1)) * 100).toFixed(0)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
