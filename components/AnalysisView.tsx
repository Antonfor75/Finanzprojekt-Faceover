'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar } from 'recharts'
import { Download } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

import CashflowTab from './analysis/CashflowTab'
import PurchasesTab from './analysis/PurchasesTab'
import { startOfWeek, endOfWeek, isWithinInterval, eachDayOfInterval, format, isSameDay, getDay, subWeeks, getISOWeek, subDays, subYears, getYear, startOfYear, endOfYear, getISOWeekYear, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, addYears } from 'date-fns'
import { de } from 'date-fns/locale'

import { Expense, FixedCost, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'
import { calculateGirokontoTimeline } from '@/utils/girokonto'

type Props = {
    expenses: Expense[]
    budget: number
    fixedCosts: FixedCost[]
    accounts: Account[]
    incomeSources: IncomeSource[]
    currentGiroBalance: number
    receiptItems?: ReceiptItem[]
    products?: Product[]
}

const COLORS = ['#FF8042', '#0088FE', '#00C49F', '#FFBB28', '#8884d8', '#ffc658', '#82ca9d']
const CATEGORY_COLORS: Record<string, string> = {
    'Essen': '#F59E0B',      // Amber
    // 'Miete': '#3B82F6',      // Blue (Removed)
    // 'Transport': '#8B5CF6',  // Violet (Removed)
    'Schminki Schminki': '#EC4899', // Pink (reused from Freizeit)
    'Shoppi': '#8B5CF6',     // Violet (reused from Transport)
    'Freizeit': '#10B981',   // Emerald (shifted)
    // 'Versicherung': '#6B7280', // Gray (Removed)
    'Sparen': '#10B981',     // Emerald
    'Sonstiges': '#9CA3AF'   // Light Gray
}

// Helper for wealth calculation
const getMonthKey = (date: Date) => format(date, 'yyyy-MM')

export default function AnalysisView({ expenses, budget, fixedCosts, accounts, incomeSources, currentGiroBalance, receiptItems = [], products = [] }: Props) {
    const [analysisTab, setAnalysisTab] = useState<'cashflow' | 'purchases'>('cashflow')
    // Lifted state from CashflowTab
    const [cashflowRange, setCashflowRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
    const [customStartDate, setCustomStartDate] = useState<Date | null>(null)

    const { total, cashflowData12M, cashflowDataWeekly, cashflowDataDaily90, cashflowDataYearly, wealthData } = useMemo(() => {
        // Determine Anchor Date (The "End" of our analysis window)
        // If Custom Start is set, End = Start + Range Interval
        // If Custom Start is NULL, End = Now (showing history going back from now)
        let anchorDate = new Date()

        if (customStartDate) {
            // If user picked a start date, we calculate the end date so that the loops (which go backwards)
            // will arrive exactly at the start date.
            // Example Daily: Loop goes i=90 down to 1. d = subDays(anchor, i).
            // We want d(i=90) to be customStartDate.
            // customStartDate = anchor - 90  =>  anchor = customStartDate + 90.
            switch (cashflowRange) {
                case 'daily': anchorDate = addDays(customStartDate, 90); break;
                case 'weekly': anchorDate = addWeeks(customStartDate, 54); break;
                case 'monthly': anchorDate = addMonths(customStartDate, 12); break;
                case 'yearly': anchorDate = addYears(customStartDate, 3); break;
            }
        }
        // If no custom date, anchorDate is NOW (default behavior: Last X days/weeks/years from today)

        const now = anchorDate // We use 'now' as the reference point for all loops


        const currentMonthKey = getMonthKey(new Date()) // For structure/wealth we still want simpler 'current', or should they follow?
        // User request: "bei der analyse einstellen... graphen" (Analysis -> Cashflow Graphs).
        // Structure/Wealth are separate tabs. Ideally they stay on "Today"?
        // Let's keep Structure/Wealth on strict 'Today' for now to avoid side effects,
        // unless requested. The prompt specifically mentioned "täglich... wochen... jahren" which maps to Cashflow.

        // --- 1. DAILY / WEEKLY DATA (Existing Logic) ---
        const start = startOfWeek(now, { weekStartsOn: 1 })
        const end = endOfWeek(now, { weekStartsOn: 1 })

        const currentWeekExpenses = expenses.filter(e => {
            const date = new Date(e.expense_date || e.created_at)
            return isWithinInterval(date, { start, end })
        })

        // Pie Data (Categories) for Daily Tab
        const groups: Record<string, number> = {}
        currentWeekExpenses.forEach(e => {
            const cat = e.category || 'Sonstiges'
            groups[cat] = (groups[cat] || 0) + Number(e.amount)
        })

        const pieData = Object.entries(groups)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)

        const totalW = pieData.reduce((acc, curr) => acc + Number(curr.value), 0)

        // Graph Data (Cumulative) for Daily Tab
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

        // Gradient Offset Logic
        const maxVal = Math.max(...graphData.map(d => d.amount))
        // If Max > Budget: Split is at Budget.
        const gradientOffset = (budget > 0 && maxVal > budget) ? (maxVal - budget) / maxVal : 0


        // --- 2. CASHFLOW DATA GENERATION (Using unified Timeline engine) ---
        // We calculate the timeline once, which holds tagesgenaue income, expenses, and fixed_costs.
        const timelineResult = calculateGirokontoTimeline(expenses, incomeSources, fixedCosts)
        const fullTimeline = timelineResult.timeline

        // Helpers to aggregate timeline
        const groupBy = (keyFn: (t: any) => string, labelFn: (t: any) => string, extraFn: (t: any) => any = () => ({})) => {
            const map: Record<string, any> = {}
            fullTimeline.forEach(t => {
                const key = keyFn(t)
                if (!map[key]) {
                    map[key] = { key, income: 0, expenses: 0, count: 0, label: labelFn(t), ...extraFn(t) }
                }
                map[key].income += t.income_val
                map[key].expenses += (t.expense_val + t.fixed_cost_val)
                map[key].count++
            })
            // Sort by key string chronologically (requires YYYY-MM prefixes or timestamp strings)
            return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
        }

        // A. DAILY
        const cashflowDataDaily90 = groupBy(
            t => format(t.date, 'yyyy-MM-dd'),
            t => format(t.date, 'dd.MM'),
            t => ({ fullDate: t.date })
        ).map(g => ({ month: g.label, income: g.income, expenses: g.expenses, fullDate: g.fullDate }))

        // B. WEEKLY
        const cashflowDataWeekly = groupBy(
            t => {
                const wStart = startOfWeek(t.date, { weekStartsOn: 1 })
                // Format: YYYY-MM-DD of the monday ensures perfect chronological sorting
                return format(wStart, 'yyyy-MM-dd')
            },
            t => `KW ${getISOWeek(t.date)}`,
            t => ({ date: startOfWeek(t.date, { weekStartsOn: 1 }) })
        ).map(g => ({ month: g.label, income: g.income, expenses: g.expenses, date: g.date }))

        // C. MONTHLY (cashflowData12M)
        const cashflowData12M = groupBy(
            t => format(t.date, 'yyyy-MM'),
            t => format(t.date, 'MMM yy', { locale: de })
        ).map(g => ({ month: g.label, income: g.income, expenses: g.expenses }))

        // D. YEARLY
        const cashflowDataYearly = groupBy(
            t => format(t.date, 'yyyy'),
            t => format(t.date, 'yyyy')
        ).map(g => ({ month: g.label, income: g.income, expenses: g.expenses }))


        // --- 3. STRUCTURE DATA (Current Month) ---
        const totalFixed = fixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0)

        const currentMonthVariable = expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at)
            return getMonthKey(d) === currentMonthKey
        }).reduce((acc, e) => acc + Number(e.amount), 0)

        const fixVsVarData = [
            {
                month: format(now, 'MMM', { locale: de }),
                fix: totalFixed,
                var: currentMonthVariable
            }
        ]

        // Top Categories (Current Month)
        const catMap: Record<string, number> = {}
        expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at)
            return getMonthKey(d) === currentMonthKey
        }).forEach(e => {
            const cat = e.category || 'Sonstiges'
            catMap[cat] = (catMap[cat] || 0) + Number(e.amount)
        })

        const topCategories = Object.entries(catMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)

        // --- 4. WEALTH DATA (Net Worth over Time) & GIROKONTO AUTOMATION ---

        // Build monthlyNetFlow from our timeline grouped monthly data!
        const monthlyNetFlow: Record<string, number> = {}
        let cumulativeNetCashflow = 0

        // Let's use the explicit group we have with keys
        const fullMonthlyGroups = groupBy(
            t => format(t.date, 'yyyy-MM'),
            t => format(t.date, 'MMM yy', { locale: de })
        )

        fullMonthlyGroups.forEach(m => {
            const net = m.income - m.expenses
            monthlyNetFlow[m.key] = net
            cumulativeNetCashflow += net
        })

        // Override 'savings' account with cumulative logic
        const modifiedAccounts = accounts.map(acc => {
            if (acc.type === 'savings') {
                return { ...acc, amount: cumulativeNetCashflow }
            }
            return acc
        })
        let calculatedCurrentWealth = modifiedAccounts.reduce((acc, a) => acc + Number(a.amount), 0)

        // Build Wealth Series Backwards
        const wealthSeries: any[] = []
        let runningWealth = calculatedCurrentWealth

        const allMonths = Object.keys(monthlyNetFlow).sort()

        for (let i = allMonths.length - 1; i >= 0; i--) {
            const mKey = allMonths[i]
            const mDate = new Date(mKey + '-01')

            wealthSeries.unshift({
                year: format(mDate, 'MMM yy', { locale: de }),
                monthKey: mKey,
                assets: runningWealth,
                debt: 0
            })

            // Subtract this month's net flow to get to the previous month's boundary
            runningWealth -= monthlyNetFlow[mKey]
        }

        return {
            pieData,
            graphData,
            total: totalW,
            gradientOffset,
            cashflowData12M,
            cashflowDataWeekly,
            cashflowDataYearly,
            cashflowDataDaily90,
            structureData: fixVsVarData,
            topCategories,
            wealthData: wealthSeries
        }
    }, [expenses, budget, fixedCosts, accounts, incomeSources])

    const generateAnalysisPDF = () => {
        const doc = new jsPDF()

        // --- HEADER ---
        doc.setFontSize(22)
        doc.text("Finanz-Analyse Bericht", 14, 20)
        doc.setFontSize(10)
        doc.text(`Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, 14, 26)

        // --- GIROKONTO ---
        doc.setFontSize(14)
        doc.text("Aktueller Kontostand (Girokonto)", 14, 36)
        doc.setFontSize(18)
        const giroColor = currentGiroBalance >= 0 ? [22, 163, 74] : [220, 38, 38] // Green or Red
        doc.setTextColor(giroColor[0], giroColor[1], giroColor[2])
        doc.text(`€${currentGiroBalance.toFixed(2)}`, 14, 44)
        doc.setTextColor(0, 0, 0) // Reset color

        let yPos = 56

        // --- ACCOUNTS OVERVIEW ---
        doc.setFontSize(14)
        doc.text("Konten Übersicht", 14, yPos)
        yPos += 8

        const accountsData = accounts.map(acc => [
            acc.name,
            acc.type === 'savings' ? 'Sparkonto' : 'Aufteilung',
            `€${acc.amount.toFixed(2)}`,
            acc.valid_from ? new Date(acc.valid_from).toLocaleDateString('de-DE') : '-'
        ])

        autoTable(doc, {
            startY: yPos,
            head: [['Name', 'Typ', 'Betrag', 'Startdatum']],
            body: accountsData.length ? accountsData : [['Keine Konten vorhanden', '-', '-', '-']],
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] }, // Blue
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 15

        // --- CASHFLOW OVERVIEW ---
        doc.setFontSize(14)
        doc.text("Cashflow Übersicht (12 Monate)", 14, yPos)
        yPos += 8

        // FIXED: Only use the last 12 months for the "12M" Overview
        const last12MonthsData = cashflowData12M.slice(-12)

        const totalIncome = last12MonthsData.reduce((acc, curr) => acc + curr.income, 0)
        const totalExpenses = last12MonthsData.reduce((acc, curr) => acc + curr.expenses, 0)
        const netCashflow = totalIncome - totalExpenses

        const cashflowRows = [
            ['Gesamt Einnahmen (12M)', `€${totalIncome.toFixed(2)}`],
            ['Gesamt Ausgaben (12M)', `€${totalExpenses.toFixed(2)}`],
            ['Netto Cashflow (12M)', `€${netCashflow.toFixed(2)}`]
        ]

        autoTable(doc, {
            startY: yPos,
            head: [['Kategorie', 'Betrag']],
            body: cashflowRows,
            theme: 'striped',
            headStyles: { fillColor: [66, 66, 66] }
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 15

        // --- CATEGORY BREAKDOWN ---
        doc.setFontSize(14)
        doc.text("Ausgaben nach Kategorien (Gesamt)", 14, yPos)
        yPos += 8

        const categories: Record<string, number> = {}
        expenses.forEach(e => {
            const cat = e.category || 'Sonstiges'
            categories[cat] = (categories[cat] || 0) + Number(e.amount)
        })
        const catRows = Object.entries(categories)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, amount]) => [cat, `€${amount.toFixed(2)}`])

        autoTable(doc, {
            startY: yPos,
            head: [['Kategorie', 'Summe']],
            body: catRows,
            theme: 'grid',
            headStyles: { fillColor: [0, 0, 0] } // Black header
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 15

        // --- GRAPHICS: 12 MONTH HISTORY (Simple Bar Chart) ---
        // distinct page or same page? 
        // If space is tight, add new page.
        if (yPos > 240) {
            doc.addPage()
            yPos = 20
        }

        doc.setFontSize(14)
        doc.text("Verlauf letzte 12 Monate (Grafik)", 14, yPos)
        yPos += 15

        const chartHeight = 60
        const chartWidth = 180
        const chartX = 14
        const chartBottom = yPos + chartHeight

        // Data for chart (Last 12 entries or all if less)
        const chartData = cashflowData12M.slice(-12)
        const maxVal = Math.max(...chartData.map(d => Math.max(d.income, d.expenses))) || 1

        const barWidth = (chartWidth / chartData.length) - 4

        chartData.forEach((d, i) => {
            const x = chartX + (i * (chartWidth / chartData.length)) + 2

            // Income Bar (Green)
            const incomeH = (d.income / maxVal) * chartHeight
            doc.setFillColor(34, 197, 94) // Green-500
            doc.rect(x, chartBottom - incomeH, barWidth / 2, incomeH, 'F')

            // Expense Bar (Red)
            const expenseH = (d.expenses / maxVal) * chartHeight
            doc.setFillColor(239, 68, 68) // Red-500
            // Draw next to income
            doc.rect(x + (barWidth / 2), chartBottom - expenseH, barWidth / 2, expenseH, 'F')

            // Label
            doc.setTextColor(100, 100, 100)
            doc.setFontSize(8)
            // Rotate label if needed or just shorten
            doc.text(d.month.split(' ')[0], x + (barWidth / 2), chartBottom + 5, { align: 'center' })
        })

        // Axis Line
        doc.setDrawColor(200, 200, 200)
        doc.line(chartX, chartBottom, chartX + chartWidth, chartBottom)

        // Legend
        const legendY = chartBottom + 12
        doc.setFillColor(34, 197, 94); doc.rect(chartX, legendY, 3, 3, 'F')
        doc.setTextColor(0, 0, 0); doc.text("Einnahmen", chartX + 5, legendY + 3)

        doc.setFillColor(239, 68, 68); doc.rect(chartX + 30, legendY, 3, 3, 'F')
        doc.text("Ausgaben", chartX + 35, legendY + 3)

        // --- GRID & SCALING (Cashflow) --- 
        doc.setTextColor(150, 150, 150)
        doc.setFontSize(8)
        // 3 Grid lines (Top, Middle, Bottom is Axis)
        // Top
        doc.text(`€${maxVal.toFixed(0)}`, chartX - 2, yPos + 4, { align: 'right' })
        doc.setDrawColor(230, 230, 230); doc.line(chartX, yPos, chartX + chartWidth, yPos)
        // Middle
        doc.text(`€${(maxVal / 2).toFixed(0)}`, chartX - 2, yPos + (chartHeight / 2) + 4, { align: 'right' })
        doc.line(chartX, yPos + (chartHeight / 2), chartX + chartWidth, yPos + (chartHeight / 2))


        // --- GRAPHICS: WEALTH HISTORY (Line Chart) ---
        yPos = chartBottom + 30
        if (yPos > 220) {
            doc.addPage()
            yPos = 20
        }

        doc.setFontSize(14)
        doc.setTextColor(0, 0, 0)
        doc.text("Vermögensentwicklung (Verlauf)", 14, yPos)
        yPos += 15

        const wChartBottom = yPos + chartHeight
        // Use last 12 months of wealth data
        const wData = wealthData.slice(-12)

        if (wData.length > 1) {
            const minW = Math.min(...wData.map(d => d.assets))
            const maxW = Math.max(...wData.map(d => d.assets))
            const rangeW = maxW - minW || 1

            // Grid & Labels for Wealth
            doc.setTextColor(150, 150, 150)
            doc.setFontSize(8)
            doc.text(`€${maxW.toFixed(0)}`, chartX - 2, yPos + 4, { align: 'right' }) // Top
            doc.setDrawColor(230, 230, 230); doc.line(chartX, yPos, chartX + chartWidth, yPos)

            doc.text(`€${minW.toFixed(0)}`, chartX - 2, wChartBottom - 2, { align: 'right' }) // Bottom (above axis)

            // Draw Line
            doc.setDrawColor(59, 130, 246) // Blue-500
            doc.setLineWidth(1)

            let prevX = 0
            let prevY = 0

            const wStepX = chartWidth / (wData.length - 1 || 1)

            wData.forEach((d, i) => {
                const x = chartX + (i * wStepX)
                // Normalize Y: (Val - Min) / Range.  Invert for PDF coords (0 is top)
                const normalizedVal = (d.assets - minW) / rangeW
                const y = wChartBottom - (normalizedVal * chartHeight)

                if (i > 0) {
                    doc.line(prevX, prevY, x, y)
                }

                // Point
                doc.setFillColor(59, 130, 246)
                doc.circle(x, y, 1.5, 'F')

                // X Label (every 2nd or 3rd to avoid crowding)
                if (i % 2 === 0 || i === wData.length - 1) {
                    doc.setTextColor(100, 100, 100)
                    doc.text(d.monthKey.split('-')[1], x, wChartBottom + 5, { align: 'center' }) // Show Month Number
                }

                prevX = x
                prevY = y
            })

            // Axis
            doc.setDrawColor(200, 200, 200)
            doc.line(chartX, wChartBottom, chartX + chartWidth, wChartBottom)
        } else {
            doc.setFontSize(10)
            doc.setTextColor(100, 100, 100)
            doc.text("Nicht genügend Daten für Verlauf.", 14, yPos + 20)
        }

        doc.save('Finanz_Analyse_Bericht.pdf')
    }

    return (
        <div className="flex flex-col h-full w-full">

            {/* --- HEADER WITH TABS + PDF BUTTON --- */}
            <div className="flex justify-between items-center pb-6 shrink-0">
                <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Analyse</h2>
                <div className="flex items-center gap-2">
                    <div className="flex bg-muted/70 rounded-xl p-1 gap-1">
                        <button
                            onClick={() => setAnalysisTab('cashflow')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 ${analysisTab === 'cashflow' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Cashflow
                        </button>
                        <button
                            onClick={() => setAnalysisTab('purchases')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 ${analysisTab === 'purchases' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Einkäufe
                        </button>
                    </div>
                    <button
                        onClick={generateAnalysisPDF}
                        className="press flex items-center gap-1.5 bg-card border border-border text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200"
                    >
                        <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                        PDF
                    </button>
                </div>
            </div>

            {/* --- SCROLLABLE CONTENT --- */}
            {/* Removed overflow-y-auto here because the parent container handles scrolling if needed, 
                BUT wait: The parent container in MobileDashboard (line 670) has overflow-y-auto. 
                So we don't need another scroll container here? 
                Actually, MobileDashboard structure is:
                Row 3 span 12: bg-white rounded-t-3xl p-4 pb-28 overflow-y-auto.
                So yes, we should just let the content flow. 
            */}
            <div className="flex-1 space-y-8">
                {analysisTab === 'purchases' && (
                    <PurchasesTab
                        expenses={expenses}
                        receiptItems={receiptItems}
                        products={products}
                    />
                )}

                {/* Wochen-Heatstrip: Farbintensität = Tagesausgaben relativ zum Tagesbudget */}
                {analysisTab === 'cashflow' && (() => {
                    const today = new Date()
                    const wStart = startOfWeek(today, { weekStartsOn: 1 })
                    const wEnd = endOfWeek(today, { weekStartsOn: 1 })
                    const days = eachDayOfInterval({ start: wStart, end: wEnd })
                    const dailyBudget = budget / 7
                    let weekSpent = 0
                    const cells = days.map(day => {
                        const spent = expenses.filter(e => {
                            const d = new Date(e.expense_date || e.created_at)
                            return isSameDay(d, day) && !e.category?.startsWith('Konto:')
                        }).reduce((s, e) => s + Number(e.amount), 0)
                        weekSpent += spent
                        const isFuture = day > today && !isSameDay(day, today)
                        const ratio = dailyBudget > 0 ? spent / dailyBudget : 0
                        let bg = 'var(--bg-muted)'
                        if (!isFuture && spent > 0) {
                            if (ratio > 1.25) bg = 'var(--chart-neg-heavy)'
                            else if (ratio > 0.75) bg = 'var(--color-primary)'
                            else if (ratio > 0.35) bg = 'color-mix(in srgb, var(--color-primary) 55%, transparent)'
                            else bg = 'color-mix(in srgb, var(--color-primary) 25%, transparent)'
                        }
                        return { day, isFuture, bg }
                    })
                    return (
                        <div className="surface p-4">
                            <div className="flex justify-between items-baseline mb-3">
                                <p className="text-sm font-semibold text-foreground">Diese Woche</p>
                                <p className="amount text-xs text-muted-foreground">€{weekSpent.toFixed(0)} / €{budget.toFixed(0)}</p>
                            </div>
                            <div className="flex gap-1.5">
                                {cells.map(({ day, isFuture, bg }, i) => (
                                    <div key={i} className="flex-1 text-center min-w-0">
                                        <div
                                            className="h-8 rounded-lg"
                                            style={isFuture ? { border: '1px dashed var(--color-border)' } : { backgroundColor: bg }}
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-1">{format(day, 'EEEEEE', { locale: de })}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })()}

                {analysisTab === 'cashflow' && (
                    <CashflowTab
                        data12M={cashflowData12M}
                        dataWeekly={cashflowDataWeekly}
                        dataYearly={cashflowDataYearly}
                        dataDaily={cashflowDataDaily90}
                    />
                )}
            </div>
        </div>
    )
}
