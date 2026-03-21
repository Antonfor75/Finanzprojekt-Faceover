'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { TrendingUp, ShieldCheck } from 'lucide-react'

type Props = {
    budget: number
    totalExpenses: number
    totalAssets: number
    currency?: string
}

export default function DashboardHealth({ budget, totalExpenses, totalAssets, currency = '€' }: Props) {
    // 1. Savings Rate Calculation
    // If expenses > budget, rate is 0. 
    // Rate = (Budget - Expenses) / Budget * 100
    const savings = Math.max(0, budget - totalExpenses)
    const savingsRate = budget > 0 ? (savings / budget) * 100 : 0

    // Mock Data for Donut
    const data = [
        { name: 'Gespart', value: savingsRate, color: 'var(--chart-pos)' }, // Green
        { name: 'Ausgegeben', value: 100 - savingsRate, color: 'var(--chart-gray)' } // Gray
    ]

    // 2. Runway Calculation
    // Assumption: Use totalAssets available
    const monthlyBurn = budget // Assuming budget is roughly what they spend/need
    const runwayMonths = monthlyBurn > 0 ? (totalAssets / monthlyBurn).toFixed(1) : '∞'

    return (
        <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Savings Rate Card */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-100 flex flex-col items-center justify-center relative overflow-hidden transition-colors">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 z-10">Sparquote</h3>
                <div className="w-20 h-20 relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={25}
                                outerRadius={35}
                                startAngle={90}
                                endAngle={-270}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Centered Percentage */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-extrabold text-gray-700">{savingsRate.toFixed(0)}%</span>
                    </div>
                </div>
                <div className="absolute -bottom-4 -right-4 text-green-50 z-0">
                    <TrendingUp className="w-24 h-24" />
                </div>
            </div>

            {/* Runway Card */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-100 flex flex-col items-center justify-center relative overflow-hidden transition-colors">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 z-10 w-full text-center">Runway</h3>

                <div className="flex flex-col items-center z-10">
                    <span className="text-3xl font-black text-blue-600">{runwayMonths}</span>
                    <span className="text-xs font-bold text-gray-400">Monate sicher</span>
                </div>

                {/* Visual Bar */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden z-10">
                    <div className="h-full bg-blue-500 w-2/3 rounded-full" />
                </div>

                <div className="absolute -bottom-2 -right-6 text-blue-50 z-0">
                    <ShieldCheck className="w-24 h-24" />
                </div>
            </div>
        </div>
    )
}
