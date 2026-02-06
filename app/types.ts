export type Expense = {
    id: number
    created_at: string
    description: string
    amount: number
    expense_date: string
    category?: string
    user_id?: string
}

export type Settings = {
    id: number
    monthly_budget: number
    savings_balance: number
    savings_months_remaining: number
    last_processed_month: string | null
    user_id?: string
}

export type Account = {
    id: number
    name: string
    amount: number
    months: number
    processed_month?: string
    type: 'distribution' | 'savings'
    user_id?: string
}

export type FixedCost = {
    id: number
    title: string
    amount: number
    user_id?: string
}

export type IncomeSource = {
    id: number
    title: string
    amount: number
    user_id?: string
}
