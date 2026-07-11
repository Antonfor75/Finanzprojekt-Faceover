'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { subMonths } from 'date-fns'
import { ChevronDown } from 'lucide-react'
import { Expense, ReceiptItem, Product } from '@/app/types'

/**
 * Analyse-Tab "Einkäufe": Kuchendiagramm der Ausgaben nach Quelle.
 * Jede angebundene Store-App (REWE, später Lidl …) ist über das source-Feld der
 * Artikel ein eigenes Stück; Ausgaben ohne Artikel fallen in ihre Kategorie.
 * Klick auf ein Store-Stück → Produkt-Aggregation über product_id
 * ("7× Gehackte Tomaten für 4,13 €"), Klick auf ein Kategorie-Stück → Ausgabenliste.
 */

type Props = {
    expenses: Expense[]
    receiptItems: ReceiptItem[]
    products: Product[]
}

type Range = '1m' | '3m' | 'all'

// Anzeige-Metadaten je Store-Quelle (erweiterbar für weitere Apps).
const SOURCE_META: Record<string, { label: string; color: string }> = {
    rewe: { label: 'REWE', color: '#CC071E' },
}

const CATEGORY_COLORS: Record<string, string> = {
    'Essen': '#F59E0B',
    'Schminki Schminki': '#EC4899',
    'Shoppi': '#8B5CF6',
    'Freizeit': '#10B981',
    'Sparen': '#14B8A6',
    'Sonstiges': '#9CA3AF',
}
const FALLBACK_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#8884d8', '#82ca9d', '#ffc658']

type Slice = {
    key: string
    label: string
    color: string
    total: number
    count: number
    kind: 'store' | 'category'
    expenseIds: Set<number>
    expenses: Expense[]
}

const fmtEur = (v: number) => `€${v.toFixed(2)}`

export default function PurchasesTab({ expenses, receiptItems, products }: Props) {
    const [range, setRange] = useState<Range>('1m')
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [showAll, setShowAll] = useState(false)

    const productNameById = useMemo(() => {
        const map = new Map<number, string>()
        for (const p of products) map.set(p.id, p.name)
        return map
    }, [products])

    const itemsByExpense = useMemo(() => {
        const map = new Map<number, ReceiptItem[]>()
        for (const item of receiptItems) {
            const list = map.get(item.expense_id)
            if (list) list.push(item)
            else map.set(item.expense_id, [item])
        }
        return map
    }, [receiptItems])

    const slices = useMemo<Slice[]>(() => {
        const now = new Date()
        const from = range === '1m' ? subMonths(now, 1) : range === '3m' ? subMonths(now, 3) : null

        const map = new Map<string, Slice>()
        let fallbackIdx = 0

        for (const expense of expenses) {
            const amount = Number(expense.amount)
            if (amount <= 0) continue // Transfers/negative Buchungen verzerren den Kuchen nicht

            const d = new Date(expense.expense_date || expense.created_at)
            if (from && d < from) continue

            // Store-Quelle (über die Artikel) schlägt die Ausgaben-Kategorie.
            const items = itemsByExpense.get(expense.id)
            const storeSource = items?.find((i) => i.source !== 'manual')?.source
            const key = storeSource ? `store:${storeSource}` : `cat:${expense.category || 'Sonstiges'}`

            let slice = map.get(key)
            if (!slice) {
                let label: string
                let color: string
                let kind: Slice['kind']
                if (storeSource) {
                    const meta = SOURCE_META[storeSource]
                    label = meta?.label || storeSource.toUpperCase()
                    color = meta?.color || FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length]
                    kind = 'store'
                } else {
                    label = expense.category || 'Sonstiges'
                    color = CATEGORY_COLORS[label] || FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length]
                    kind = 'category'
                }
                slice = { key, label, color, total: 0, count: 0, kind, expenseIds: new Set(), expenses: [] }
                map.set(key, slice)
            }
            slice.total += amount
            slice.count += 1
            slice.expenseIds.add(expense.id)
            slice.expenses.push(expense)
        }

        return [...map.values()].sort((a, b) => b.total - a.total)
    }, [expenses, itemsByExpense, range])

    const selected = slices.find((s) => s.key === selectedKey) ?? slices[0] ?? null
    const total = slices.reduce((s, x) => s + x.total, 0)

    // Drilldown: Produkt-Aggregation (Store) bzw. Ausgabenliste (Kategorie).
    const detailRows = useMemo(() => {
        if (!selected) return []

        if (selected.kind === 'store') {
            type Group = { name: string; qty: number; hasKg: boolean; hasPiece: boolean; lines: number; total: number }
            const groups = new Map<string, Group>()
            for (const expenseId of selected.expenseIds) {
                for (const item of itemsByExpense.get(expenseId) || []) {
                    const key = item.product_id ? `p:${item.product_id}` : `r:${item.name_raw}`
                    const name = (item.product_id && productNameById.get(item.product_id)) || item.name_raw
                    let g = groups.get(key)
                    if (!g) {
                        g = { name, qty: 0, hasKg: false, hasPiece: false, lines: 0, total: 0 }
                        groups.set(key, g)
                    }
                    g.qty += Number(item.quantity) || 1
                    if (item.unit === 'kg') g.hasKg = true
                    else g.hasPiece = true
                    g.lines += 1
                    g.total += Number(item.total_price)
                }
            }
            return [...groups.values()]
                .sort((a, b) => b.total - a.total)
                .map((g) => ({
                    label: g.name,
                    sub: g.hasKg && !g.hasPiece
                        ? `${(Math.round(g.qty * 1000) / 1000)} kg`
                        : g.hasKg
                            ? `${g.lines}×`
                            : `${Math.round(g.qty)}×`,
                    value: g.total,
                }))
        }

        return [...selected.expenses]
            .sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime())
            .map((e) => ({
                label: e.description || e.category || 'Ausgabe',
                sub: new Date(e.expense_date || e.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                value: Number(e.amount),
            }))
    }, [selected, itemsByExpense, productNameById])

    const visibleRows = showAll ? detailRows : detailRows.slice(0, 10)
    const hiddenCount = detailRows.length - visibleRows.length
    const hiddenSum = detailRows.slice(10).reduce((s, r) => s + r.value, 0)

    const handleSelect = (key: string) => {
        setSelectedKey(key)
        setShowAll(false)
    }

    if (slices.length === 0) {
        return (
            <div className="space-y-4">
                <RangeSwitcher range={range} setRange={setRange} />
                <p className="text-muted-foreground text-center py-12 text-sm">Keine Ausgaben im Zeitraum.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <RangeSwitcher range={range} setRange={setRange} />
            </div>

            {/* Donut mit Zentrum-Anzeige */}
            <div className="relative h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={slices}
                            dataKey="total"
                            nameKey="label"
                            innerRadius={64}
                            outerRadius={95}
                            paddingAngle={2}
                            strokeWidth={0}
                            onClick={(d: any) => d?.key && handleSelect(d.key)}
                        >
                            {slices.map((s) => (
                                <Cell
                                    key={s.key}
                                    fill={s.color}
                                    opacity={!selected || selected.key === s.key ? 1 : 0.35}
                                    className="cursor-pointer transition-opacity duration-200"
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground">{selected ? selected.label : 'Gesamt'}</span>
                    <span className="amount text-xl font-semibold text-foreground">
                        {fmtEur(selected ? selected.total : total)}
                    </span>
                </div>
            </div>

            {/* Legende als klickbare Pills */}
            <div className="flex flex-wrap gap-2 justify-center">
                {slices.map((s) => (
                    <button
                        key={s.key}
                        onClick={() => handleSelect(s.key)}
                        className={`press flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors duration-200 ${selected?.key === s.key ? 'bg-card text-foreground' : 'bg-transparent text-muted-foreground border-border hover:text-foreground'}`}
                        style={selected?.key === s.key ? { borderColor: s.color } : undefined}
                    >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Drilldown */}
            {selected && (
                <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm text-foreground">{selected.label}</span>
                        <span className="text-xs text-muted-foreground">
                            {selected.count} {selected.count === 1 ? 'Einkauf' : 'Einkäufe'} · {fmtEur(selected.total)}
                        </span>
                    </div>
                    <div className="border-t border-border/60">
                        {visibleRows.map((row, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-b-0 text-sm">
                                <span className="text-foreground truncate mr-3">
                                    {row.label}
                                    <span className="text-xs text-muted-foreground ml-1.5">{row.sub}</span>
                                </span>
                                <span className="amount text-xs text-muted-foreground shrink-0">{fmtEur(row.value)}</span>
                            </div>
                        ))}
                    </div>
                    {hiddenCount > 0 && (
                        <button
                            onClick={() => setShowAll(true)}
                            className="press w-full flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground pt-3 transition-colors duration-200"
                        >
                            <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
                            {hiddenCount} weitere anzeigen ({fmtEur(hiddenSum)})
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

function RangeSwitcher({ range, setRange }: { range: Range; setRange: (r: Range) => void }) {
    const options: { key: Range; label: string }[] = [
        { key: '1m', label: '1M' },
        { key: '3m', label: '3M' },
        { key: 'all', label: 'Alle' },
    ]
    return (
        <div className="flex bg-muted/70 rounded-xl p-1 gap-1">
            {options.map((opt) => (
                <button
                    key={opt.key}
                    onClick={() => setRange(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 ${range === opt.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}
