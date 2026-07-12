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
            <div className="bg-card p-4 rounded-xl shadow-lg border border-border">
                <p className="text-sm font-semibold text-muted-foreground mb-2">{label}</p>
                <div className="space-y-1">
                    <div className="flex justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">Einnahmen:</span>
                        <span className="amount text-[var(--chart-pos)]">+€{Number(data.income).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">Ausgaben:</span>
                        <span className="amount text-[var(--chart-neg-heavy)]">−€{Number(data.expenses).toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-border my-2" />
                    <div className="flex justify-between gap-4 text-sm font-semibold">
                        <span className="text-foreground">Ergebnis:</span>
                        <span className={`amount ${isPositive ? 'text-[var(--chart-pos)]' : 'text-[var(--chart-neg-heavy)]'}`}>
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
        <div className="surface p-4 relative">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${isTotalPositive ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg)]/10 text-[var(--chart-neg-heavy)]'}`}>
                        {isTotalPositive ? <ArrowUpRight className="w-4.5 h-4.5" strokeWidth={1.75} /> : <ArrowDownRight className="w-4.5 h-4.5" strokeWidth={1.75} />}
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-foreground">Netto-Cashflow</h3>
                        <p className="text-xs text-muted-foreground">Einnahmen − Ausgaben</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`text-right ${isTotalPositive ? 'text-[var(--chart-pos)]' : 'text-[var(--chart-neg-heavy)]'}`}>
                        <p className="eyebrow">Gesamt</p>
                        <p className="amount text-lg">{isTotalPositive ? '+' : ''}€{totalNet.toFixed(2)}</p>
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
            </div>

            <div className="flex h-[300px] w-full">
                {/* FIXED Y-AXIS LEFT */}
                <div className="w-[60px] h-full shrink-0 border-r border-border bg-card z-10">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[{ val: domain[0] }, { val: domain[1] }]} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: 'var(--text-muted-foreground)', fontWeight: '500' }}
                                domain={domain}
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
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted-foreground)' }} dy={10} />
                                <YAxis hide domain={domain} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                <ReferenceLine y={0} stroke="var(--text-muted-foreground)" strokeWidth={1.5} />
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

            <div className="mt-4 flex gap-4 justify-center text-xs text-muted-foreground">
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
