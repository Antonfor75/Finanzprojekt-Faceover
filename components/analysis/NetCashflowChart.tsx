import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useLayoutEffect } from 'react'

type Props = {
    data: any[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        const net = data.income - data.expenses
        const isPositive = net >= 0

        return (
            <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100">
                <p className="text-sm font-bold text-gray-500 mb-2">{label}</p>
                <div className="space-y-1">
                    <div className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-600">Einnahmen:</span>
                        <span className="font-bold text-green-600">+€{Number(data.income).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-600">Ausgaben:</span>
                        <span className="font-bold text-red-600">-€{Number(data.expenses).toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-gray-200 my-2" />
                    <div className="flex justify-between gap-4 text-sm font-bold">
                        <span className="text-gray-800">Ergebnis:</span>
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
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Transform data to include 'net' for easier charting
    const chartData = data.map(d => ({
        ...d,
        net: d.income - d.expenses
    }))

    const totalNet = chartData.reduce((acc, curr) => acc + curr.net, 0)
    const isTotalPositive = totalNet >= 0

    // Dynamic Width Calculation
    // Assuming approx 50px per bar for readability
    const pointWidth = 50
    const chartWidth = Math.max(500, chartData.length * pointWidth)

    // Calculate Domain for Synchronization
    // We need the max absolute value of 'net' to center 0 or scale properly
    // Actually, we just need the max/min of the net values to define the domain
    const maxVal = Math.max(...chartData.map(d => Math.abs(d.net || 0)), 100) * 1.1
    // Symmetric domain often looks better for net positive/negative charts
    const domain = [-maxVal, maxVal]

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

    // Auto-Scroll to the right
    useLayoutEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth
        }
    }, [data])

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-100 relative">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${isTotalPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {isTotalPositive ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">Netto Cashflow</h3>
                        <p className="text-xs text-gray-400">Einnahmen - Ausgaben</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className={`text-right ${isTotalPositive ? 'text-green-600' : 'text-red-600'}`}>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Gesamt</p>
                        <p className="text-xl font-black">{isTotalPositive ? '+' : ''}€{totalNet.toFixed(2)}</p>
                    </div>

                    {/* SCROLL CONTROLS */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => scroll('left')}
                            className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-rose-100 active:scale-95 transition-all"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-rose-100 active:scale-95 transition-all"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex h-[300px] w-full">
                {/* FIXED Y-AXIS LEFT */}
                <div className="w-[60px] h-full shrink-0 border-r border-rose-100 bg-white z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[{ val: domain[0] }, { val: domain[1] }]} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#6B7280', fontWeight: '500' }}
                                domain={domain}
                                width={60}
                                tickFormatter={(value) => `${value >= 1000 || value <= -1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
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
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={10} />
                                <YAxis hide domain={domain} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={2} />
                                <Bar dataKey="net" radius={[4, 4, 4, 4]}>
                                    {chartData.map((entry, index) => {
                                        const isPositive = entry.net >= 0
                                        let fill = isPositive ? 'var(--chart-pos)' : 'var(--chart-neg)' // Green or Red

                                        // Highlighting Outliers (Loss > 1000)
                                        if (!isPositive && entry.net < -1000) {
                                            fill = 'var(--chart-neg-heavy)' // Dark Red
                                        }

                                        return <Cell key={`cell-${index}`} fill={fill} />
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="mt-4 flex gap-4 justify-center text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--chart-pos)' }}></div>
                    <span>Gewinn</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--chart-neg)' }}></div>
                    <span>Verlust</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--chart-neg-heavy)' }}></div>
                    <span>Hoher Verlust ({'>'}1k)</span>
                </div>
            </div>
        </div>
    )
}
