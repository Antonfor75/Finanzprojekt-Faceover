'use client'

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { LayoutDashboard } from 'lucide-react'

// Mock Data removed, now using props

type Props = {
    fixVsVarData: any[]
    topCatsData: any[]
}

export default function StructureTab({ fixVsVarData, topCatsData }: Props) {
    return (
        <div className="space-y-6">

            {/* 1. FIX VS VARIABLE */}
            <div className="bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-500/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <LayoutDashboard className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Fix vs. Variabel</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Flexibilität des Budgets</p>
                    </div>
                </div>

                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={fixVsVarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                            <Bar dataKey="fix" stackId="a" fill="#1e3a8a" name="Fixkosten" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="var" stackId="a" fill="#93c5fd" name="Variabel" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. TOP CATEGORIES (Horizontal Bar) */}
            <div className="bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 p-4 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4">Top 5 Ausgaben</h3>
                <div className="space-y-3">
                    {topCatsData.map((cat, idx) => (
                        <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{idx + 1}. {cat.name}</span>
                                <span className="font-bold text-gray-900 dark:text-gray-100">€{Number(cat.value).toFixed(2)}</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${(Number(cat.value) / (Number(topCatsData[0]?.value) || 1)) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    )
}
