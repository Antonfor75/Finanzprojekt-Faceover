'use client'

import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, ReferenceLine, Cell
} from 'recharts'
import { TrendingUp, Scale } from 'lucide-react'

// Mock Data removed, now using props

type Props = {
    data: any[]
    currency?: string
    range: '12m' | '4w'
    setRange: (r: '12m' | '4w') => void
}

export default function CashflowTab({ data, currency = '€', range, setRange }: Props) {
    return (
        <div className="space-y-6">

            {/* 1. TREND CHART (Income vs Expenses) */}
            <div className="bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 dark:bg-blue-500/20 rounded-lg text-blue-600 dark:text-blue-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 dark:text-gray-200">Einnahmen vs. Ausgaben</h3>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{range === '12m' ? 'Letzte 12 Monate' : 'Letzte 4 Wochen'}</p>
                        </div>
                    </div>

                    {/* Toggle */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
                        <button
                            onClick={() => setRange('12m')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${range === '12m' ? 'bg-white shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            12M
                        </button>
                        <button
                            onClick={() => setRange('4w')}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${range === '4w' ? 'bg-white shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            4W
                        </button>
                    </div>
                </div>

                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" name="Einnahmen" />
                            <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" name="Ausgaben" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. SAVINGS RATE CHART */}
            <div className="bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-green-50 dark:bg-green-500/20 rounded-lg text-green-600 dark:text-green-400">
                        <Scale className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Sparquote Historie</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Letzte 6 Monate</p>
                    </div>
                </div>

                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <ReferenceLine y={20} stroke="#3b82f6" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Ziel 20%', fill: '#3b82f6', fontSize: 10 }} />
                            <Bar dataKey="savingsRate" radius={[4, 4, 0, 0]} name="Sparquote (%)">
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.savingsRate >= 20 ? '#22c55e' : '#fbbf24'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
    )
}
