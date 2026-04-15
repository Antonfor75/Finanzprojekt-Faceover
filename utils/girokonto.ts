import { addDays, format, getDaysInMonth, getDaysInYear } from 'date-fns'
import { Expense, IncomeSource, FixedCost } from '@/app/types'

export interface TimelineEntry {
    date: Date;
    balance: number;
    tagesbudget: number;
    tagesergebnis: number;
    income_val: number;
    fixed_cost_val: number;
    expense_val: number;
}

export function calculateGirokontoTimeline(
    expenses: Expense[],
    incomeSources: IncomeSource[],
    fixedCosts: FixedCost[],
    initialBalance: number = 0
) {
    let earliestDataDate: Date | null = null

    // Find earliest date from data
    const allDates: number[] = []
    if (expenses.length > 0) {
        allDates.push(...expenses.map(e => new Date(e.expense_date || e.created_at).getTime()))
    }
    if (incomeSources.length > 0) {
        allDates.push(...incomeSources.filter(s => s.valid_from).map(s => new Date(s.valid_from!).getTime()))
    }
    if (fixedCosts.length > 0) {
        allDates.push(...fixedCosts.filter(fc => fc.valid_from).map(fc => new Date(fc.valid_from!).getTime()))
    }

    if (allDates.length > 0) {
        earliestDataDate = new Date(Math.min(...allDates))
    }

    if (!earliestDataDate) {
        return { finalBalance: initialBalance, timeline: [] }
    }

    let now = new Date()
    now.setHours(12, 0, 0, 0)
    // Start exactly at the earliest data day (at 12:00 PM noon to avoid DST issues crossing midnights)
    let simDate = new Date(earliestDataDate)
    simDate.setHours(12, 0, 0, 0)
    
    // We add an extra day back to show the starting point properly
    simDate = addDays(simDate, -1)

    let girokontoBalance = initialBalance
    const timeline: TimelineEntry[] = []

    const expensesByDay: Record<string, number> = {}
    expenses.forEach(e => {
        const key = format(new Date(e.expense_date || e.created_at), 'yyyy-MM-dd')
        expensesByDay[key] = (expensesByDay[key] || 0) + Number(e.amount)
    })

    while (simDate <= now) {
        const daysInCurrentMonth = getDaysInMonth(simDate)
        const daysInCurrentYear = getDaysInYear(simDate)

        let totalDailyFixedCosts = 0
        let totalDailyIncome = 0

        // 1. Accrue Fixed Costs for today (proportional drip)
        fixedCosts.forEach(fc => {
            const from = fc.valid_from ? new Date(fc.valid_from) : null
            if (from) from.setHours(0, 0, 0, 0)
            const to = fc.valid_to ? new Date(fc.valid_to) : null
            if (to) to.setHours(23, 59, 59, 999)

            // Aktivierungs-Check (Heute >= Startdatum)
            const isActive = (!from || simDate >= from) && (!to || simDate <= to)
            if (!isActive) return;

            let dailyCost = 0
            if (!fc.frequency || fc.frequency === 'monthly') {
                dailyCost = Number(fc.amount) / daysInCurrentMonth
            } else if (fc.frequency === 'daily') {
                dailyCost = Number(fc.amount)
            } else if (fc.frequency === 'weekly') {
                dailyCost = Number(fc.amount) / 7
            } else if (fc.frequency === 'quarterly') {
                dailyCost = Number(fc.amount) / (daysInCurrentYear / 4)
            } else if (fc.frequency === 'yearly') {
                dailyCost = Number(fc.amount) / daysInCurrentYear
            }

            totalDailyFixedCosts += dailyCost
        })

        // 2. Accrue Income Sources for today (proportional drip)
        incomeSources.forEach(src => {
            const from = src.valid_from ? new Date(src.valid_from) : null
            if (from) from.setHours(0, 0, 0, 0)
            const to = src.valid_to ? new Date(src.valid_to) : null
            if (to) to.setHours(23, 59, 59, 999)
            
            // Aktivierungs-Check
            const isActive = (!from || simDate >= from) && (!to || simDate <= to)
            if (!isActive) return;

            let dailyIncome = 0
            if (!src.frequency || src.frequency === 'monthly') {
                dailyIncome = Number(src.amount) / daysInCurrentMonth
            } else if (src.frequency === 'daily') {
                dailyIncome = Number(src.amount)
            } else if (src.frequency === 'weekly') {
                dailyIncome = Number(src.amount) / 7
            } else if (src.frequency === 'yearly') {
                dailyIncome = Number(src.amount) / daysInCurrentYear
            }

            totalDailyIncome += dailyIncome
        })

        // 3. Tagesbudget = Einnahmen(Tageswerte) - Fixkosten(Tageswerte)
        const tagesbudget = totalDailyIncome - totalDailyFixedCosts

        // 4. Variable Ausgaben an Tag X
        const dayKey = format(simDate, 'yyyy-MM-dd')
        const dayExpenses = expensesByDay[dayKey] || 0

        // 5. Tagesergebnis = Tagesbudget - variable Ausgaben an Tag X
        const tagesergebnis = tagesbudget - dayExpenses

        // 6. Girokonto_Neu = Girokonto_Alt + Tagesergebnis
        girokontoBalance += tagesergebnis

        // Record timeline
        timeline.push({
            date: new Date(simDate), // keep as midday for safety or rely on formatter
            balance: girokontoBalance,
            tagesbudget: tagesbudget,
            tagesergebnis: tagesergebnis,
            income_val: totalDailyIncome,
            fixed_cost_val: totalDailyFixedCosts,
            expense_val: dayExpenses
        })

        simDate = addDays(simDate, 1)
        simDate.setHours(12, 0, 0, 0) // Explicitly ensure we are at noon again
    }

    return {
        finalBalance: girokontoBalance,
        timeline
    }
}
