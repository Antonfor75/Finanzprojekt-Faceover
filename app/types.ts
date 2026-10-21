import type { ShareMode } from '@/utils/sharing/types'

export type Expense = {
    id: number
    created_at: string
    description: string
    amount: number
    expense_date: string
    category?: string
    account_id?: number | null
    /** Gesetzt bei Umbuchungen Girokonto <-> Spaßkonto; verbindet beide Seiten. */
    transfer_id?: string | null
    /** Geteilter Einkauf (drizzle/0013): Teilung, voller Bon-Betrag, Modus und Hinweistext. Bleiben nach dem Trennen bis auf die Teilungs-ID stehen. */
    shared_purchase_id?: string | null
    share_total?: number | null // numeric → kommt als String zurück, Number(...) beim Konsumieren
    share_mode?: ShareMode | null
    share_note?: string | null
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
    type: 'distribution' | 'savings' | 'fun'
    user_id?: string
}

export type AccountTransaction = {
    id: number
    created_at: string
    account_id: number
    amount: number
    type: 'manual_deposit' | 'auto_deposit' | 'transfer_in' | 'transfer_out'
    note?: string | null
    transaction_date: string
    transfer_id?: string | null
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
    execution_day?: number | null
    frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
    user_id?: string
}

export type IncomeSource = {
    id: number
    created_at?: string
    title: string
    amount: number
    valid_from?: string
    valid_to?: string | null
    execution_day?: number | null
    frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
    user_id?: string
}

export type ReceiptItem = {
    id: number
    created_at?: string
    user_id?: string
    expense_id: number
    product_id?: number | null
    name_raw: string
    quantity: number // numeric → kommt als String zurück, Number(...) beim Konsumieren
    unit?: 'stk' | 'kg' | null
    unit_price?: number | null
    total_price: number
    source: 'rewe' | 'manual' // 'rewe' = früherer E-Mail-Import (eingestellt), Daten bleiben
    shared_purchase_id?: string | null // geteilter Einkauf (drizzle/0013)
    shared_away?: boolean // Artikel gehört nach dem Teilen dem Partner (nicht in meiner Analyse)
}

export type Product = {
    id: number
    created_at?: string
    user_id?: string
    name: string
    category?: string | null
}

// Spaßkonto v2: ein Konto pro User, optionale Gruppen mit Zeitraum.
export type FunAccountV2 = {
    id: number
    created_at?: string
    name: string
    foresight_enabled: boolean
    user_id?: string
}

export type FunGroup = {
    id: number
    created_at?: string
    fun_account_id: number
    name: string
    start_date: string // "Von"
    end_date?: string | null // "Bis", optional — null = Ein-Tages-Ereignis (= start_date)
    user_id?: string
}

export type FunGroupExpense = {
    id: number
    created_at?: string
    fun_account_id: number
    group_id?: number | null
    amount: number
    description?: string | null
    expense_date: string // darf in der Zukunft liegen (geplante Ausgabe)
    transfer_id?: string | null
    user_id?: string
}

export type FunIncomeEntry = {
    id: number
    created_at?: string
    fun_account_id: number
    group_id?: number | null
    amount: number
    description?: string | null
    income_date: string
    transfer_id?: string | null
    user_id?: string
}
