'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'

import { Expense } from '@/app/types'

type Props = {
    expenses: Expense[]
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

export default function AnalysisView({ expenses }: Props) {
    const data = useMemo(() => {
        const now = new Date()
        const start = startOfWeek(now, { weekStartsOn: 1 })
        const end = endOfWeek(now, { weekStartsOn: 1 })

        const currentWeekExpenses = expenses.filter(e => {
            const date = new Date(e.expense_date || e.created_at)
            return isWithinInterval(date, { start, end })
        })

        const groups: Record<string, number> = {}
        currentWeekExpenses.forEach(e => {
            const cat = e.category || 'Sonstiges'
            groups[cat] = (groups[cat] || 0) + Number(e.amount)
        })

        return Object.entries(groups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value) // Sort by value desc
    }, [expenses])

    const total = data.reduce((acc, curr) => acc + Number(curr.value), 0)

    if (data.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <p className="text-xl font-bold">Keine Ausgaben</p>
                <p>in dieser Woche</p>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <h2 className="text-2xl font-bold text-center mb-4">Wochenanalyse</h2>

            <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
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
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 bg-gray-50 p-4 rounded-xl">
                <div className="flex justify-between items-center font-bold text-lg mb-2">
                    <span>Gesamt</span>
                    <span>€{total.toFixed(2)}</span>
                </div>
                <div className="space-y-2">
                    {data.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm text-gray-600">
                            <span>{item.name}</span>
                            <span>{((item.value / total) * 100).toFixed(0)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
