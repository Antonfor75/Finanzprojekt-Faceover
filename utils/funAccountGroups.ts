import { FunGroup, FunGroupExpense, FunIncomeEntry } from '@/app/types'

export type Bucket = 'aktuell' | 'zukuenftig' | 'vergangen'

function normalizeToNoon(d: Date): Date {
    const n = new Date(d)
    n.setHours(12, 0, 0, 0)
    return n
}

/**
 * Ordnet ein einzelnes Datum (Ausgabe/Einnahme) relativ zu heute ein.
 */
export function classifyBucket(dateStr: string, now: Date = new Date()): Bucket {
    const today = normalizeToNoon(now)
    const date = normalizeToNoon(new Date(dateStr))
    if (date.getTime() === today.getTime()) return 'aktuell'
    return date.getTime() > today.getTime() ? 'zukuenftig' : 'vergangen'
}

/**
 * Ordnet eine Gruppe relativ zu heute ein. Ohne end_date gilt die Gruppe als
 * Ein-Tages-Ereignis (end = start_date).
 */
export function classifyGroupBucket(
    group: Pick<FunGroup, 'start_date' | 'end_date'>,
    now: Date = new Date()
): Bucket {
    const today = normalizeToNoon(now)
    const start = normalizeToNoon(new Date(group.start_date))
    const end = normalizeToNoon(new Date(group.end_date ?? group.start_date))

    if (start.getTime() > today.getTime()) return 'zukuenftig'
    if (end.getTime() < today.getTime()) return 'vergangen'
    return 'aktuell'
}

/**
 * Saldo = Summe(Einnahmen mit Datum <= heute) - Summe(Ausgaben).
 * Bei foresightEnabled=true zählen ALLE Ausgaben schon mit (auch zukünftig
 * datierte, "reservierte"); Einnahmen zählen unabhängig davon immer erst
 * ab ihrem tatsächlichen Datum. Bei foresightEnabled=false zählen auf beiden
 * Seiten nur Einträge mit Datum <= heute.
 */
export function calculateFunAccountSaldo(
    expenses: Pick<FunGroupExpense, 'amount' | 'expense_date'>[],
    income: Pick<FunIncomeEntry, 'amount' | 'income_date'>[],
    foresightEnabled: boolean,
    now: Date = new Date()
): number {
    const today = normalizeToNoon(now)

    const totalIncome = income
        .filter(i => normalizeToNoon(new Date(i.income_date)).getTime() <= today.getTime())
        .reduce((sum, i) => sum + Number(i.amount), 0)

    const totalExpenses = foresightEnabled
        ? expenses.reduce((sum, e) => sum + Number(e.amount), 0)
        : expenses
            .filter(e => normalizeToNoon(new Date(e.expense_date)).getTime() <= today.getTime())
            .reduce((sum, e) => sum + Number(e.amount), 0)

    return totalIncome - totalExpenses
}
