
export interface ParsedExpense {
    date: Date
    amount: number
    category: string
    description: string
}

export function parseBankStatement(text: string): ParsedExpense[] {
    const lines = text.split('\n')
    const results: ParsedExpense[] = []

    // regex for lines like: "05.02.2026 -5,22 EUR"
    // Also handles spaces/tabs effectively
    const lineRegex = /(\d{2})\.(\d{2})\.(\d{4})\s+([\-\d,.]+)\s+EUR/i

    for (const line of lines) {
        const match = line.match(lineRegex)
        if (match) {
            const day = parseInt(match[1], 10)
            const month = parseInt(match[2], 10) - 1 // JS months are 0-indexed
            const year = parseInt(match[3], 10)

            // Value string like "-5,22" -> replace comma with dot
            let valueStr = match[4].replace(',', '.')
            // Only simple float parsing needed for this format

            let amount = parseFloat(valueStr)

            // Logic:
            // 1. If amount > 0 (Income) -> IGNORE
            // 2. If amount < 0 (Expense) -> Convert to positive for storage, categorize

            if (amount < 0) {
                const expenseAmount = Math.abs(amount)
                let category = 'Sonstiges'

                // Categorization Rules
                if (expenseAmount < 30) {
                    category = 'Essen'
                } else {
                    category = 'Freizeit'
                }

                const date = new Date(year, month, day)
                const dateStr = `${day.toString().padStart(2, '0')}.${(month + 1).toString().padStart(2, '0')}.${year}`

                results.push({
                    date: date,
                    amount: expenseAmount,
                    category: category,
                    description: `Import ${dateStr}`
                })
            }
        }
    }

    return results
}
