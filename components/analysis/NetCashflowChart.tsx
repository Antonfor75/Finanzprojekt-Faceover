'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

type Props = {
    data: any[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        const net = data.income - data.expenses
        const isPositive = net >= 0

        return (
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">{label}</p>
                <div className="space-y-1">
                    <div className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Einnahmen:</span>
                        <span className="font-bold text-green-600">+€{Number(data.income).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Ausgaben:</span>
                        <span className="font-bold text-red-600">-€{Number(data.expenses).toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />
                    <div className="flex justify-between gap-4 text-sm font-bold">
                        <span className="text-gray-800 dark:text-gray-100">Ergebnis:</span>
                        <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                            {isPositive ? '+' : ''}€{net.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        )
    }
    return null
}

export default function NetCashflowChart({ data }: Props) {
    // Transform data to include 'net' for easier charting
    const chartData = data.map(d => ({
        ...d,
        net: d.income - d.expenses
    }))

    const totalNet = chartData.reduce((acc, curr) => acc + curr.net, 0)
    const isTotalPositive = totalNet >= 0

    return (
        <div className="bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${isTotalPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {isTotalPositive ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Netto Cashflow</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Einnahmen - Ausgaben</p>
                    </div>
                </div>
                <div className={`text-right ${isTotalPositive ? 'text-green-600' : 'text-red-600'}`}>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Gesamt</p>
                    <p className="text-xl font-black">{isTotalPositive ? '+' : ''}€{totalNet.toFixed(2)}</p>
                </div>
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                        <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={2} />
                        <Bar dataKey="net" radius={[4, 4, 4, 4]}>
                            {chartData.map((entry, index) => {
                                const isPositive = entry.net >= 0
                                let fill = isPositive ? '#10b981' : '#ef4444' // Emerald-500 or Red-500

                                // Highlighting Outliers (Loss > 1000)
                                if (!isPositive && entry.net < -1000) {
                                    fill = '#991b1b' // Dark Red (Red-800)
                                }

                                return <Cell key={`cell-${index}`} fill={fill} />
                            })}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 flex gap-4 justify-center text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                    <span>Gewinn</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-red-500"></div>
                    <span>Verlust</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm bg-red-800"></div>
                    <span>Hoher Verlust ({'>'}1k)</span>
                </div>
            </div>
        </div>
    )
}
