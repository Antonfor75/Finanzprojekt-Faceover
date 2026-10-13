import type { Expense, FixedCost, Settings, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'
import type { FunSummary } from './funSummary'

export type DashboardData = {
    expenses: Expense[]
    monthlyBudget: number
    fixedCosts: FixedCost[]
    settings: Settings
    accounts: Account[]
    incomeSources: IncomeSource[]
    // Bon-Artikel werden erst geladen, wenn Historie/Analyse geöffnet wird: undefined = noch nicht geladen
    receiptItems?: ReceiptItem[]
    products?: Product[]
    funSummary: FunSummary
}

/**
 * Was nach dem Speichern neu geladen werden muss. Ohne Angabe wird alles neu geladen.
 * 'receipts' lädt Artikel + Produkte (nur, wenn sie schon einmal geladen wurden).
 */
export type RefreshScope = 'expenses' | 'accounts' | 'receipts'
export type DashboardRefresh = (scope?: RefreshScope[]) => void | Promise<void>

// --- Letzter Datenstand auf dem Gerät -------------------------------------------
// Beim nächsten Öffnen werden diese Daten sofort angezeigt und im Hintergrund
// aktualisiert (auch im Funkloch sieht man so seine Zahlen). Gehört immer zu genau
// einem Nutzer und wird beim Abmelden gelöscht. Speicher kann fehlen/voll sein → still ignorieren.

const CACHE_KEY = 'cashflow:last-data:v1'

export function readCachedData(userId: string): DashboardData | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as { userId: string; data: DashboardData }
        return parsed.userId === userId ? parsed.data : null
    } catch {
        return null
    }
}

export function writeCachedData(userId: string, data: DashboardData) {
    try {
        // Artikel/Produkte nicht mitspeichern: die werden ohnehin erst bei Bedarf geladen.
        const withoutReceipts: DashboardData = { ...data, receiptItems: undefined, products: undefined }
        localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, data: withoutReceipts }))
    } catch {
        // Speicher voll oder gesperrt: dann eben ohne Zwischenstand
    }
}

export function clearCachedData() {
    try {
        localStorage.removeItem(CACHE_KEY)
    } catch {
        // nichts zu tun
    }
}
