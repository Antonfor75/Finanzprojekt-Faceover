import { addDays, format, getDaysInMonth, getDaysInYear } from 'date-fns'
import { Expense, IncomeSource, FixedCost } from '@/app/types'
import { isBudgetRelevantExpense } from './funAccount'
import { isTransferExpense } from './transfer'

export interface TimelineEntry {
    date: Date;
    balance: number;
    tagesbudget: number;
    tagesergebnis: number;
    income_val: number;
    fixed_cost_val: number;
    expense_val: number;
    /** Umbuchungen/manuelle Buchungen des Tages (+ = vom Girokonto weg). Bewegen den Kontostand, sind aber keine Ausgabe. */
    transfer_val: number;
}

// Gültigkeitsfenster einer Quelle einmalig als Zeitstempel (statt pro Simulationstag
// zwei neue Date-Objekte zu erzeugen). Gleiche Grenzen wie zuvor: from 00:00, to 23:59:59.999.
// Ungültige Datumswerte ergeben NaN — jeder Vergleich damit ist false, genau wie mit einem
// ungültigen Date-Objekt.
interface ActiveWindow {
    from: number | null
    to: number | null
    amount: number
    frequency: string | undefined
}

function toWindow(src: { valid_from?: string | null; valid_to?: string | null; amount: number; frequency?: string }): ActiveWindow {
    let from: number | null = null
    if (src.valid_from) {
        const d = new Date(src.valid_from)
        d.setHours(0, 0, 0, 0)
        from = d.getTime()
    }
    let to: number | null = null
    if (src.valid_to) {
        const d = new Date(src.valid_to)
        d.setHours(23, 59, 59, 999)
        to = d.getTime()
    }
    return { from, to, amount: Number(src.amount), frequency: src.frequency }
}

// Entspricht format(date, 'yyyy-MM-dd') für gültige Daten, ohne den date-fns-Formatierer
// pro Simulationstag zu durchlaufen.
export function dayKeyOf(d: Date): string {
    const y = String(d.getFullYear()).padStart(4, '0')
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export type GirokontoTimelineResult = ReturnType<typeof calculateGirokontoTimeline>

export function calculateGirokontoTimeline(
    expenses: Expense[],
    incomeSources: IncomeSource[],
    fixedCosts: FixedCost[],
    initialBalance: number = 0
) {
    // Find earliest date from data (Schleife statt Math.min(...spread): kein Stack-Limit
    // bei sehr vielen Einträgen; ein ungültiges Datum ergibt wie Math.min NaN)
    let earliest = Infinity
    let hasDates = false
    const consider = (t: number) => {
        hasDates = true
        if (Number.isNaN(t) || Number.isNaN(earliest)) earliest = NaN
        else if (t < earliest) earliest = t
    }
    for (const e of expenses) consider(new Date(e.expense_date || e.created_at).getTime())
    for (const s of incomeSources) if (s.valid_from) consider(new Date(s.valid_from).getTime())
    for (const fc of fixedCosts) if (fc.valid_from) consider(new Date(fc.valid_from).getTime())

    if (!hasDates) {
        return { finalBalance: initialBalance, timeline: [] }
    }
    const earliestDataDate = new Date(earliest)

    const now = new Date()
    now.setHours(12, 0, 0, 0)
    // Start exactly at the earliest data day (at 12:00 PM noon to avoid DST issues crossing midnights)
    let simDate = new Date(earliestDataDate)
    simDate.setHours(12, 0, 0, 0)

    // We add an extra day back to show the starting point properly
    simDate = addDays(simDate, -1)

    let girokontoBalance = initialBalance
    const timeline: TimelineEntry[] = []

    const expensesByDay: Record<string, number> = {}
    const transfersByDay: Record<string, number> = {}
    // Account-paid expenses (savings/fun) are budget-neutral: the money already
    // left the budget via the linked fixed cost, so counting them here would double-count.
    // Umbuchungen bewegen den Kontostand, werden aber getrennt gefuehrt (keine Ausgabe in den Analysen).
    expenses.filter(isBudgetRelevantExpense).forEach(e => {
        const key = format(new Date(e.expense_date || e.created_at), 'yyyy-MM-dd')
        const bucket = isTransferExpense(e) ? transfersByDay : expensesByDay
        bucket[key] = (bucket[key] || 0) + Number(e.amount)
    })

    const fixedWindows = fixedCosts.map(toWindow)
    const incomeWindows = incomeSources.map(toWindow)

    while (simDate <= now) {
        const daysInCurrentMonth = getDaysInMonth(simDate)
        const daysInCurrentYear = getDaysInYear(simDate)
        const simTime = simDate.getTime()

        let totalDailyFixedCosts = 0
        let totalDailyIncome = 0

        // 1. Accrue Fixed Costs for today (proportional drip)
        for (const fc of fixedWindows) {
            // Aktivierungs-Check (Heute >= Startdatum)
            const isActive = (fc.from === null || simTime >= fc.from) && (fc.to === null || simTime <= fc.to)
            if (!isActive) continue

            let dailyCost = 0
            if (!fc.frequency || fc.frequency === 'monthly') {
                dailyCost = fc.amount / daysInCurrentMonth
            } else if (fc.frequency === 'daily') {
                dailyCost = fc.amount
            } else if (fc.frequency === 'weekly') {
                dailyCost = fc.amount / 7
            } else if (fc.frequency === 'quarterly') {
                dailyCost = fc.amount / (daysInCurrentYear / 4)
            } else if (fc.frequency === 'yearly') {
                dailyCost = fc.amount / daysInCurrentYear
            }

            totalDailyFixedCosts += dailyCost
        }

        // 2. Accrue Income Sources for today (proportional drip)
        for (const src of incomeWindows) {
            // Aktivierungs-Check
            const isActive = (src.from === null || simTime >= src.from) && (src.to === null || simTime <= src.to)
            if (!isActive) continue

            let dailyIncome = 0
            if (!src.frequency || src.frequency === 'monthly') {
                dailyIncome = src.amount / daysInCurrentMonth
            } else if (src.frequency === 'daily') {
                dailyIncome = src.amount
            } else if (src.frequency === 'weekly') {
                dailyIncome = src.amount / 7
            } else if (src.frequency === 'yearly') {
                dailyIncome = src.amount / daysInCurrentYear
            }

            totalDailyIncome += dailyIncome
        }

        // 3. Tagesbudget = Einnahmen(Tageswerte) - Fixkosten(Tageswerte)
        const tagesbudget = totalDailyIncome - totalDailyFixedCosts

        // 4. Variable Ausgaben und Umbuchungen an Tag X
        const dayKey = dayKeyOf(simDate)
        const dayExpenses = expensesByDay[dayKey] || 0
        const dayTransfers = transfersByDay[dayKey] || 0

        // 5. Tagesergebnis = Tagesbudget - variable Ausgaben - Umbuchungen an Tag X
        const tagesergebnis = tagesbudget - dayExpenses - dayTransfers

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
            expense_val: dayExpenses,
            transfer_val: dayTransfers
        })

        simDate = addDays(simDate, 1)
        simDate.setHours(12, 0, 0, 0) // Explicitly ensure we are at noon again
    }

    return {
        finalBalance: girokontoBalance,
        timeline
    }
}
