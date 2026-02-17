
import { ParsedExpense, parseBankStatement } from './parseBankStatement'

export interface ImportData {
    expenses: ParsedExpense[]
    income: ParsedIncome[]
    fixedCosts: ParsedFixedCost[]
    accounts: ParsedAccount[]
    unknownLines: string[] // For feedback
}

export interface ParsedIncome {
    title: string
    amount: number
    frequency: 'monthly' | 'yearly' | 'weekly' | 'daily'
    valid_from?: Date
    valid_to?: Date
}

export interface ParsedFixedCost {
    title: string
    amount: number
    frequency?: string // We usually assume monthly for fixed costs in DB, but let's see. DB has no frequency column for fixed_costs, it's just monthly amount.
    valid_from?: Date
    valid_to?: Date
}

export interface ParsedAccount {
    name: string
    amount: number // Current Balance
    type: 'distribution' | 'savings'
    valid_from?: Date
}

export function parseFullImport(text: string): ImportData {
    const lines = text.split('\n')
    const result: ImportData = {
        expenses: [],
        income: [],
        fixedCosts: [],
        accounts: [],
        unknownLines: []
    }

    let currentSection: 'none' | 'expenses' | 'income' | 'fixedCosts' | 'accounts' = 'none'

    // Temporary buffer for expenses text to pass to existing parser
    let expensesBuffer: string[] = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        // Detect Section Headers
        if (line.toLowerCase().startsWith('# ausgaben')) {
            currentSection = 'expenses'
            continue
        }
        if (line.toLowerCase().startsWith('# einnahmen')) {
            currentSection = 'income'
            continue
        }
        if (line.toLowerCase().startsWith('# fixkosten')) {
            currentSection = 'fixedCosts'
            continue
        }
        if (line.toLowerCase().startsWith('# konten') || line.toLowerCase().startsWith('# girokonto')) {
            currentSection = 'accounts'
            continue
        }

        // Process Content based on Section
        if (currentSection === 'expenses') {
            expensesBuffer.push(line)
        } else if (currentSection === 'income') {
            // Format: Title; Amount; Interval; [From]; [To]
            const parts = line.split(';').map(s => s.trim())
            if (parts.length >= 2) {
                const title = parts[0]
                const amount = parseFloat(parts[1].replace(',', '.'))
                const freqRaw = parts[2]?.toLowerCase() || 'monthly'
                const fromStr = parts[3]
                const toStr = parts[4]

                let frequency: 'monthly' | 'yearly' | 'weekly' | 'daily' = 'monthly'
                if (['yearly', 'jährlich', 'jahr'].includes(freqRaw)) frequency = 'yearly'
                if (['weekly', 'wöchentlich', 'woche'].includes(freqRaw)) frequency = 'weekly'
                if (['daily', 'täglich', 'tag'].includes(freqRaw)) frequency = 'daily'

                if (!isNaN(amount)) {
                    result.income.push({
                        title,
                        amount,
                        frequency,
                        valid_from: parseDate(fromStr),
                        valid_to: parseDate(toStr)
                    })
                }
            } else {
                result.unknownLines.push(line)
            }
        } else if (currentSection === 'fixedCosts') {
            // Format: Title; Amount; [From]; [To]
            // Note: DB structure for fixed_costs is title, amount, valid_from, valid_to. no frequency (implied monthly).
            const parts = line.split(';').map(s => s.trim())
            if (parts.length >= 2) {
                const title = parts[0]
                const amount = parseFloat(parts[1].replace(',', '.'))
                const fromStr = parts[2]
                const toStr = parts[3]

                if (!isNaN(amount)) {
                    result.fixedCosts.push({
                        title,
                        amount,
                        valid_from: parseDate(fromStr),
                        valid_to: parseDate(toStr)
                    })
                }
            }
        } else if (currentSection === 'accounts') {
            // Format: Name; Amount; [Type]; [Date]
            const parts = line.split(';').map(s => s.trim())
            if (parts.length >= 2) {
                const name = parts[0]
                const amount = parseFloat(parts[1].replace(',', '.'))
                const typeRaw = parts[2]?.toLowerCase() || 'distribution'
                const dateStr = parts[3]

                let type: 'distribution' | 'savings' = 'distribution'
                if (['savings', 'sparen', 'sparkonto'].includes(typeRaw)) type = 'savings'

                if (!isNaN(amount)) {
                    result.accounts.push({
                        name,
                        amount,
                        type,
                        valid_from: parseDate(dateStr)
                    })
                }
            }
        } else {
            // Default to expenses if no header found initially? Or just treat as unknown
            // Existing behavior was "paste everywhere".
            // Let's assume if NO header is found at start, treat WHOLE text as expenses (backward compatibility)
            if (currentSection === 'none') {
                expensesBuffer.push(line)
            }
        }
    }

    // Process buffered expenses
    if (expensesBuffer.length > 0) {
        const expensesText = expensesBuffer.join('\n')
        const parsedExpenses = parseBankStatement(expensesText)
        result.expenses = parsedExpenses
    }

    return result
}

function parseDate(str?: string): Date | undefined {
    if (!str) return undefined
    // Try DD.MM.YYYY
    const parts = str.split('.')
    if (parts.length === 3) {
        const d = parseInt(parts[0])
        const m = parseInt(parts[1]) - 1
        const y = parseInt(parts[2])
        const date = new Date(y, m, d)
        if (!isNaN(date.getTime())) return date
    }
    // Try YYYY-MM-DD
    const isoParts = str.split('-')
    if (isoParts.length === 3) {
        const date = new Date(str)
        if (!isNaN(date.getTime())) return date
    }
    return undefined
}
