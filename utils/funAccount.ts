import { Expense } from '@/app/types'

/**
 * Returns the list of months (YYYY-MM) for which a fun account's monthly feed
 * still needs to be credited. Catches up months where the app was not opened.
 *
 * Rules:
 * - Months up to and including `processedMonth` are already credited.
 * - If `processedMonth` is null, only the current month is credited (no
 *   back-shock, analogous to processWeeklySavings initialization).
 * - Months before `validFrom` and after `validTo` of the feed are skipped.
 * - Never credits future months.
 */
export function getMonthsToCredit(
    processedMonth: string | null,
    validFrom: string | null,
    validTo: string | null,
    now: Date = new Date()
): string[] {
    const currentMonth = toMonthKey(now)

    if (!processedMonth) {
        // No history: start with the current month only (if the feed is active)
        return isMonthInRange(currentMonth, validFrom, validTo) ? [currentMonth] : []
    }

    const months: string[] = []
    let cursor = nextMonth(processedMonth)
    // Safety bound: never loop more than 10 years
    let guard = 120
    while (cursor <= currentMonth && guard-- > 0) {
        if (isMonthInRange(cursor, validFrom, validTo)) {
            months.push(cursor)
        }
        cursor = nextMonth(cursor)
    }
    return months
}

function toMonthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number)
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function isMonthInRange(monthKey: string, validFrom: string | null, validTo: string | null): boolean {
    if (validFrom && monthKey < toMonthKey(new Date(validFrom))) return false
    if (validTo && monthKey > toMonthKey(new Date(validTo))) return false
    return true
}

/**
 * An expense is budget-relevant when it was paid from the regular weekly
 * budget. Expenses paid from an account (savings goal or fun account) carry
 * an `account_id`; legacy account expenses (before account_id was set) are
 * recognized by the rewritten 'Konto: <name>' category.
 */
export function isBudgetRelevantExpense(e: Pick<Expense, 'account_id' | 'category'>): boolean {
    return !e.account_id && !e.category?.startsWith('Konto:')
}
