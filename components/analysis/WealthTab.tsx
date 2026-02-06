'use client'

import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Gem } from 'lucide-react'

// Mock Data removed, now using props

type Props = {
    data: any[]
    currentAssets?: number
}

export default function WealthTab({ data, currentAssets = 0 }: Props) {
    return (
        <div className="space-y-6">

            {/* NET WORTH CHART */}
            <div className="bg-white dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-purple-50 dark:bg-purple-500/20 rounded-lg text-purple-600 dark:text-purple-400">
                        <Gem className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">Nettovermögen</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Entwicklung über Zeit</p>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorAssets" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="assets"
                                stackId="1"
                                stroke="#8b5cf6"
                                fill="url(#colorAssets)"
                                name="Vermögen"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-2">Key Stats</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Aktuelles Vermögen</p>
                            <p className="text-xl font-bold text-purple-600 dark:text-purple-400">€{currentAssets.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Veränderung (YTD)</p>
                            {/* Simple Logic: compare last data point with first of this year or just show total growth */}
                            <p className="text-xl font-bold text-green-500 dark:text-green-400">
                                {data.length > 1 ? `€${(data[0].assets - data[data.length - 1].assets).toLocaleString()}` : '-'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}
