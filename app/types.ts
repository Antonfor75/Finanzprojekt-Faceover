export type Expense = {
    id: number
    created_at: string
    description: string
    amount: number
    expense_date: string
    category?: string
    account_id?: number | null
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
    start_amount?: number // Initial value
    target_amount?: number
    target_date?: string
    months: number
    processed_month?: string
    valid_from?: string | null
    type: 'distribution' | 'savings'
    user_id?: string
}

export type FixedCost = {
    id: number
    title: string
    amount: number
    account_id?: number | null // Legacy / deprecated?
    linked_account_id?: number | null // Link to savings account
    valid_from?: string | null
    valid_to?: string | null
    user_id?: string
}

export type IncomeSource = {
    id: number
    created_at?: string
    title: string
    amount: number
    valid_from?: string
    valid_to?: string | null
    frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
    user_id?: string
}
