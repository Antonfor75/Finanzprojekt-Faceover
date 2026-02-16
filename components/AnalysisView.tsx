'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar } from 'recharts'

import CashflowTab from './analysis/CashflowTab'
import { startOfWeek, endOfWeek, isWithinInterval, eachDayOfInterval, format, isSameDay, getDay, subWeeks, getISOWeek, subDays, subYears, getYear, startOfYear, endOfYear, getISOWeekYear, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, addYears } from 'date-fns'
import { de } from 'date-fns/locale'

import { Expense, FixedCost, Account, IncomeSource } from '@/app/types'

type Props = {
    expenses: Expense[]
    budget: number
    fixedCosts: FixedCost[]
    accounts: Account[]
    incomeSources: IncomeSource[]
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

// Helper for wealth calculation
const getMonthKey = (date: Date) => format(date, 'yyyy-MM')

export default function AnalysisView({ expenses, budget, fixedCosts, accounts, incomeSources }: Props) {
    // Lifted state from CashflowTab
    const [cashflowRange, setCashflowRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
    const [customStartDate, setCustomStartDate] = useState<Date | null>(null)

    const { total, cashflowData12M, cashflowDataWeekly, cashflowDataDaily90, cashflowDataYearly } = useMemo(() => {
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


        // --- 2. CASHFLOW DATA ---
        // --- 2. CASHFLOW DATA GENERATION ---

        // Helper: Check if source overlaps with an interval [start, end]
        // This fixes the issue where sources starting mid-month or ending mid-month were ignored,
        // or where yearly data ignored sources not active on July 1st.
        const isSourceActiveInInterval = (src: IncomeSource, intervalStart: Date, intervalEnd: Date) => {
            const srcFrom = src.valid_from ? new Date(src.valid_from) : null
            const srcTo = src.valid_to ? new Date(src.valid_to) : null

            // Normalize dates to remove time (avoid timezone issues)
            const iStart = new Date(intervalStart); iStart.setHours(0, 0, 0, 0)
            const iEnd = new Date(intervalEnd); iEnd.setHours(23, 59, 59, 999)

            if (srcFrom) srcFrom.setHours(0, 0, 0, 0)
            if (srcTo) srcTo.setHours(23, 59, 59, 999)

            // Overlap condition: SourceStart <= IntervalEnd && SourceEnd >= IntervalStart
            // If srcFrom is null, it started beginning of time (always valid start)
            // If srcTo is null, it ends end of time (always valid end)

            const startCondition = !srcFrom || srcFrom <= iEnd
            const endCondition = !srcTo || srcTo >= iStart

            return startCondition && endCondition
        }


        // --- Determine Global Start Date (Earliest Transaction or Income) ---
        let earliestDate = subYears(now, 1) // Default 1 year if no data

        // Check Expenses
        if (expenses.length > 0) {
            const dates = expenses.map(e => new Date(e.expense_date || e.created_at).getTime())
            const minDate = new Date(Math.min(...dates))
            if (minDate < earliestDate) earliestDate = minDate
        }

        // Check Income Sources
        if (incomeSources.length > 0) {
            const dates = incomeSources
                .filter(src => src.valid_from)
                .map(src => new Date(src.valid_from!).getTime())

            if (dates.length > 0) {
                const minDate = new Date(Math.min(...dates))
                if (minDate < earliestDate) earliestDate = minDate
            }
        }

        // Ensure we don't go into the future or start after now (basic safety)
        if (earliestDate > now) earliestDate = subYears(now, 1)


        // --- 2. CASHFLOW DATA GENERATION (Full History) ---

        // A. MONTHLY (Full History)
        const cashflowData12M = []
        // Iterate from Earliest Month up to Last Month
        const mStart = startOfMonth(earliestDate)
        const mEnd = endOfMonth(subDays(now, now.getDate())) // End of LAST month (to avoid incomplete current month if desired, or use 'now' for full)
        // Actually user wants "current date" at the end, so let's include current partial month? 
        // Standard practice: Show completed periods or up to now. 
        // Let's go up to current month to show latest status.
        let iterDateM = mStart
        const mFinal = endOfMonth(now)

        while (iterDateM <= mFinal) {
            const monthStart = startOfMonth(iterDateM)
            const monthEnd = endOfMonth(iterDateM)
            const label = format(iterDateM, 'MMM yy', { locale: de })

            // Income
            const income = incomeSources.filter(src => isSourceActiveInInterval(src, monthStart, monthEnd)).reduce((sum, src) => {
                switch (src.frequency) {
                    case 'weekly': return sum + (Number(src.amount) * 4.33)
                    case 'daily': return sum + (Number(src.amount) * 30.4)
                    case 'yearly': return sum + (Number(src.amount) / 12)
                    case 'monthly': default: return sum + Number(src.amount)
                }
            }, 0)

            // Expenses
            const expensesForMonth = expenses.filter(e => {
                const eDate = new Date(e.expense_date || e.created_at)
                return getMonthKey(eDate) === getMonthKey(iterDateM)
            }).reduce((acc, curr) => acc + Number(curr.amount), 0)

            const totalFixed = fixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0)

            cashflowData12M.push({ month: label, income, expenses: expensesForMonth + totalFixed })
            iterDateM = addMonths(iterDateM, 1)
        }

        // B. WEEKLY (Full History)
        const cashflowDataWeekly = []
        const wStart = startOfWeek(earliestDate, { weekStartsOn: 1 })
        const wEnd = endOfWeek(now, { weekStartsOn: 1 })

        let iterDateW = wStart
        while (iterDateW <= wEnd) {
            const weekStart = startOfWeek(iterDateW, { weekStartsOn: 1 })
            const weekEnd = endOfWeek(iterDateW, { weekStartsOn: 1 })
            const label = `KW ${getISOWeek(iterDateW)}`

            // Income (Weekly Basis)
            const income = incomeSources.filter(src => isSourceActiveInInterval(src, weekStart, weekEnd)).reduce((sum, src) => {
                switch (src.frequency) {
                    case 'monthly': return sum + (Number(src.amount) / 4.33)
                    case 'daily': return sum + (Number(src.amount) * 7)
                    case 'yearly': return sum + (Number(src.amount) / 52)
                    case 'weekly': default: return sum + Number(src.amount)
                }
            }, 0)

            // Expenses
            const expensesForWeek = expenses.filter(e => {
                const eDate = new Date(e.expense_date || e.created_at)
                return isWithinInterval(eDate, { start: weekStart, end: weekEnd })
            }).reduce((acc, curr) => acc + Number(curr.amount), 0)

            // Fixed Costs (Weekly)
            const totalFixedWeekly = fixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0) / 4.33

            cashflowDataWeekly.push({ month: label, income, expenses: expensesForWeek + totalFixedWeekly, date: weekStart })
            iterDateW = addWeeks(iterDateW, 1)
        }

        // C. DAILY (Full History)
        const cashflowDataDaily90 = []
        const dStart = earliestDate // Start from earliest
        const dEnd = now // Up to Today

        let iterDateD = dStart
        while (iterDateD <= dEnd) {
            const d = new Date(iterDateD)
            const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
            const label = format(d, 'dd.MM')

            // Income (Daily Basis)
            const income = incomeSources.filter(src => isSourceActiveInInterval(src, dayStart, dayEnd)).reduce((sum, src) => {
                switch (src.frequency) {
                    case 'monthly': return sum + (Number(src.amount) / 30.4)
                    case 'weekly': return sum + (Number(src.amount) / 7)
                    case 'yearly': return sum + (Number(src.amount) / 365)
                    case 'daily': default: return sum + Number(src.amount)
                }
            }, 0)

            // Expenses
            const expensesForDay = expenses.filter(e => {
                const eDate = new Date(e.expense_date || e.created_at)
                return isSameDay(eDate, d)
            }).reduce((acc, curr) => acc + Number(curr.amount), 0)

            // Fixed Costs (Daily)
            const totalFixedDaily = fixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0) / 30.4

            cashflowDataDaily90.push({ month: label, income, expenses: expensesForDay + totalFixedDaily, fullDate: new Date(d) })
            iterDateD = addDays(iterDateD, 1)
        }

        // D. YEARLY (Full History)
        const cashflowDataYearly = []
        const currentYear = getYear(now)
        const startYear = getYear(earliestDate)

        for (let y = startYear; y <= currentYear; y++) {
            const label = String(y)

            // Calculate Income by summing up 12 months (Check activity per month)
            let yearlyIncome = 0
            for (let m = 0; m < 12; m++) {
                const mStart = new Date(y, m, 1)
                const mEnd = endOfMonth(mStart)
                // Don't count future months if we are in current year? 
                // Strict cashflow: Yes, count active sources. 
                // But users might prefer "Year to Date"? 
                // Let's keep it full year projection or active.

                const monthIncome = incomeSources.filter(src => isSourceActiveInInterval(src, mStart, mEnd)).reduce((sum, src) => {
                    switch (src.frequency) {
                        case 'weekly': return sum + (Number(src.amount) * 4.33)
                        case 'daily': return sum + (Number(src.amount) * 30.4)
                        case 'yearly': return sum + (Number(src.amount) / 12)
                        case 'monthly': default: return sum + Number(src.amount)
                    }
                }, 0)
                yearlyIncome += monthIncome
            }

            // Expenses
            const expensesForYear = expenses.filter(e => {
                const eDate = new Date(e.expense_date || e.created_at)
                return getYear(eDate) === y
            }).reduce((acc, curr) => acc + Number(curr.amount), 0)

            // Fixed Costs (Yearly)
            const totalFixedYearly = fixedCosts.reduce((acc, fc) => acc + Number(fc.amount), 0) * 12

            cashflowDataYearly.push({ month: label, income: yearlyIncome, expenses: expensesForYear + totalFixedYearly })
        }


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

        // A. Determine Calculation Range (Start from earliest expense or 12 months ago)
        let startDate = new Date()
        if (expenses.length > 0) {
            const dates = expenses.map(e => new Date(e.expense_date || e.created_at).getTime())
            startDate = new Date(Math.min(...dates))
            // Go back to start of that month
            startDate.setDate(1)
            startDate.setHours(0, 0, 0, 0)
        } else {
            startDate.setMonth(startDate.getMonth() - 12)
            startDate.setDate(1)
        }

        // B. Calculate Historical Net Cashflow per Month
        const tempDate = new Date(startDate)
        const loopEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const monthlyNetFlow: Record<string, number> = {}
        let cumulativeNetCashflow = 0

        while (tempDate <= loopEnd) {
            const mKey = getMonthKey(tempDate)
            const d = new Date(tempDate) // 1st of month

            // 1. Dynamic Income for this month
            const monthIncome = incomeSources.filter(src => {
                const from = src.valid_from ? new Date(src.valid_from) : null
                const to = src.valid_to ? new Date(src.valid_to) : null
                if (from && d < new Date(from.getFullYear(), from.getMonth(), 1)) return false
                if (to && d > to) return false
                return true
            }).reduce((sum, src) => sum + Number(src.amount), 0)

            // 2. Expenses for this month
            const monthExpenses = expenses.filter(e => {
                const eDate = new Date(e.expense_date || e.created_at)
                return getMonthKey(eDate) === mKey
            }).reduce((acc, curr) => acc + Number(curr.amount), 0) + totalFixed

            // 3. Net
            const net = monthIncome - monthExpenses
            monthlyNetFlow[mKey] = net
            cumulativeNetCashflow += net

            tempDate.setMonth(tempDate.getMonth() + 1)
        }

        // C. Update 'Girokonto' (Savings) Account with Cumulative Result
        // We find the 'savings' account and override its amount for the 'Current Wealth' calculation
        let calculatedCurrentWealth = 0
        const modifiedAccounts = accounts.map(acc => {
            if (acc.type === 'savings') {
                return { ...acc, amount: cumulativeNetCashflow }
            }
            return acc
        })

        // If no savings account exists, effectively we just ignore the 'Girokonto' part or should we add it?
        // For now, only override if exists.
        calculatedCurrentWealth = modifiedAccounts.reduce((acc, a) => acc + Number(a.amount), 0)

        // D. Build Wealth Series Backwards
        const wealthSeries = []
        let runningWealth = calculatedCurrentWealth

        // Get all months in stats
        const allMonths = Object.keys(monthlyNetFlow).sort() // Should be sorted by Key YYYY-MM

        // We actually want to go backwards from NOW
        for (let i = allMonths.length - 1; i >= 0; i--) {
            const mKey = allMonths[i]
            const mDate = new Date(mKey + '-01')

            wealthSeries.unshift({
                year: format(mDate, 'MMM yy', { locale: de }),
                monthKey: mKey,
                assets: runningWealth,
                debt: 0
            })

            // To get Previous Month's Wealth, we SUBTRACT this month's Net Flow
            // (Current = Previous + Net) => (Previous = Current - Net)
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

    return (
        <div className="flex flex-col h-full bg-white dark:bg-transparent rounded-t-3xl overflow-hidden shadow-[0_-5px_20px_rgba(0,0,0,0.05)] border-t border-gray-100 dark:border-white/5 pb-20 scale-[1.15] origin-top w-[87%] mx-auto">
            {/* --- SCROLLABLE CONTENT --- */}
            <div className="flex-1 overflow-y-auto p-4 space-y-8">
                <CashflowTab
                    data12M={cashflowData12M}
                    dataWeekly={cashflowDataWeekly}
                    dataYearly={cashflowDataYearly}
                    dataDaily={cashflowDataDaily90}
                />
            </div>
        </div>
    )
}
