import { startOfWeek, endOfWeek, addDays, subYears, format, isSameDay } from 'date-fns'
import { Expense, IncomeSource, FixedCost } from '@/app/types'

export function calculateGirokontoTimeline(
    expenses: Expense[],
    incomeSources: IncomeSource[],
    fixedCosts: FixedCost[]
) {
    let earliestDate = subYears(new Date(), 1)

    // Find earliest date from data
    if (expenses.length > 0) {
        const d = expenses.map(e => new Date(e.expense_date || e.created_at).getTime())
        earliestDate = new Date(Math.min(...d, earliestDate.getTime()))
    }
    if (incomeSources.length > 0) {
        const d = incomeSources.filter(s => s.valid_from).map(s => new Date(s.valid_from!).getTime())
        if (d.length > 0) earliestDate = new Date(Math.min(...d, earliestDate.getTime()))
    }

    // Always start on a Monday
    let simDate = startOfWeek(earliestDate, { weekStartsOn: 1 })
    simDate.setHours(0, 0, 0, 0)

    const now = new Date()

    let girokontoBalance = 0
    let currentWeeklyBucket = 0
    let weeklyIncome = 0
    let weeklyFixed = 0

    const timeline: { date: Date, balance: number }[] = []

    const expensesByDay: Record<string, number> = {}
    expenses.forEach(e => {
        const key = format(new Date(e.expense_date || e.created_at), 'yyyy-MM-dd')
        expensesByDay[key] = (expensesByDay[key] || 0) + Number(e.amount)
    })

    const CONST_WEEKS_PER_MONTH = 4.33

    while (simDate <= now) {
        const dayOfWeek = simDate.getDay() // 0 = Sunday, 1 = Monday
        const weekEnd = endOfWeek(simDate, { weekStartsOn: 1 })

        // --- 1. MONDAY 0:00 - NEW WEEK STARTS ---
        if (dayOfWeek === 1) {
            // Calculate active income and fixed costs for this week

            // Weekly Income
            weeklyIncome = incomeSources.reduce((sum, src) => {
                const from = src.valid_from ? new Date(src.valid_from) : null
                const to = src.valid_to ? new Date(src.valid_to) : null

                const isActive = (!from || from <= weekEnd) && (!to || to >= simDate)
                if (isActive) {
                    // One-time payment (completely within this week)
                    if (from && to && from >= simDate && to <= weekEnd) {
                        return sum + Number(src.amount)
                    }

                    switch (src.frequency) {
                        case 'daily': return sum + (Number(src.amount) * 7)
                        case 'weekly': return sum + Number(src.amount)
                        case 'yearly': return sum + (Number(src.amount) / 52)
                        case 'monthly':
                        default:
                            return sum + (Number(src.amount) / CONST_WEEKS_PER_MONTH)
                    }
                }
                return sum
            }, 0)

            // Weekly Fixed Costs
            weeklyFixed = fixedCosts.reduce((sum, fc) => {
                const from = fc.valid_from ? new Date(fc.valid_from) : null
                const to = fc.valid_to ? new Date(fc.valid_to) : null

                const isActive = (!from || from <= weekEnd) && (!to || to >= simDate)
                if (isActive) {
                    return sum + (Number(fc.amount) / CONST_WEEKS_PER_MONTH)
                }
                return sum
            }, 0)

            // Refill bucket with net income
            currentWeeklyBucket = weeklyIncome - weeklyFixed
        }

        // --- 2. DAILY EXPENSES ---
        const dayKey = format(simDate, 'yyyy-MM-dd')
        const dayExpenses = expensesByDay[dayKey] || 0
        currentWeeklyBucket -= dayExpenses

        // --- 3. DAILY ONE-TIME INCOMES TO GIROKONTO ---
        // Some income sources might be injected direct to Giro if they happen ON this day and are one_time
        const dailyDirectIncome = incomeSources.reduce((sum, src) => {
            if (!src.frequency) {
                const validFrom = src.valid_from ? new Date(src.valid_from) : null
                if (validFrom && isSameDay(validFrom, simDate)) {
                    return sum + Number(src.amount)
                }
            }
            return sum
        }, 0)
        girokontoBalance += dailyDirectIncome

        // --- 4. SUNDAY 23:45 - END OF WEEK ROLLOVER ---
        if (dayOfWeek === 0) {
            // The week is over. Transfer remaining bucket to Girokonto.
            // If negative, it reduces the Girokonto.
            girokontoBalance += currentWeeklyBucket
            currentWeeklyBucket = 0 // Reset bucket visually
        }

        // Record timeline
        timeline.push({
            date: new Date(simDate),
            balance: girokontoBalance
        })

        simDate = addDays(simDate, 1)
    }

    return {
        finalBalance: girokontoBalance,
        timeline
    }
}
