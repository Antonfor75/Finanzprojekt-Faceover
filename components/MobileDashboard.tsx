'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { loadTheme } from '@/utils/theme'
import { runStartupJobs } from '@/lib/data/actions'
import { ArrowUpRight, Settings, List, Plus, Home, TrendingUp, TrendingDown, CalendarClock, Check, ChevronRight, Sparkles, ScanLine } from 'lucide-react'
import { startOfWeek, endOfWeek, format, isSameDay, isWithinInterval, getDaysInMonth } from 'date-fns'
import { supabase } from '@/utils/supabase'

import AddExpenseForm, { warmUpExpenseForm } from './AddExpenseForm'
import { ViewLoading } from './dashboard/ViewLoading'
import { downloadExpensesPdf } from './dashboard/expensesPdf'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { loadFunSummary, type FunSummary } from '@/lib/data/funSummary'
import type { DashboardRefresh } from '@/lib/data/dashboardData'
import { addFunGroupExpense, updateTransfer, deleteTransfer } from '@/lib/data/actions'
import { DatePicker } from '@/components/ui/date-picker'
// import DashboardHealth from './DashboardHealth' // REMOVED
import { calculateGirokontoTimeline } from '@/utils/girokonto'
import { expenseEditPatch, isSpendingExpense, isTransferExpense } from '@/utils/transfer'
import { preloadPdf, withPdf } from '@/lib/pdf'
import { useReceiptScanEnabled } from '@/utils/receiptScan/useReceiptScanEnabled'

import { Expense, FixedCost, Settings as SettingsType, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'

type MainView = 'entry' | 'history' | 'settings'

// Unteransichten (Diagramme/recharts, Einstellungen, Spaßkonto) gehören nicht ins
// Startpaket: sie werden getrennt geladen und kurz nach dem ersten Anzeigen im
// Hintergrund vorgeladen, sodass sie beim ersten Antippen bereits bereitstehen.
const loadAnalysisView = () => import('./AnalysisView')
const loadGirokontoView = () => import('./GirokontoView')
const loadSettingsOverlay = () => import('./SettingsOverlay')
const loadFunAccountHub = () => import('./FunAccountHub')
const loadFunAccountView = () => import('./FunAccountView')
const loadHistoryView = () => import('./dashboard/HistoryView')

const GirokontoView = dynamic(loadGirokontoView, { ssr: false, loading: ViewLoading })
const SettingsOverlay = dynamic(loadSettingsOverlay, { ssr: false, loading: ViewLoading })
const FunAccountHub = dynamic(loadFunAccountHub, { ssr: false, loading: ViewLoading })
const FunAccountView = dynamic(loadFunAccountView, { ssr: false, loading: ViewLoading })
// Historie (Kalender/Liste) ist für das schnelle Eintragen auf der Startseite nicht nötig
const HistoryView = dynamic(loadHistoryView, { ssr: false, loading: ViewLoading })
// Kassenbon-Scan (nur freigeschaltete Konten) — erst laden, wenn die Funktion freigeschaltet ist
const ReceiptScanView = dynamic(() => import('./receipt/ReceiptScanView'), { ssr: false, loading: ViewLoading })
const PendingReceiptTile = dynamic(() => import('./receipt/PendingReceiptTile'), { ssr: false })

function preloadSubViews() {
    for (const load of [loadHistoryView, loadAnalysisView, loadGirokontoView, loadSettingsOverlay, loadFunAccountHub, loadFunAccountView]) {
        load().catch(() => {}) // Fehler hier egal: beim Öffnen wird erneut geladen
    }
}

const NO_RECEIPT_ITEMS: ReceiptItem[] = []
const NO_PRODUCTS: Product[] = []

export default function MobileDashboard({
    expenses: serverExpenses,
    initialBudget,
    initialFixedCosts,
    initialSettings,
    initialAccounts,
    initialIncomeSources,
    receiptItems: loadedReceiptItems,
    products: loadedProducts,
    initialFunSummary,
    onNeedReceipts,
    onUpdate
}: {
    expenses: Expense[],
    initialBudget: number,
    initialFixedCosts: FixedCost[],
    initialSettings: SettingsType,
    initialAccounts: Account[],
    initialIncomeSources: IncomeSource[],
    // undefined = noch nicht geladen (werden erst für Historie/Analyse nachgeladen)
    receiptItems?: ReceiptItem[],
    products?: Product[],
    // Spaßkonto-Kacheln, schon beim Start mitgeladen; undefined = selbst laden
    initialFunSummary?: FunSummary,
    onNeedReceipts?: () => void,
    onUpdate?: DashboardRefresh
}) {
    const receiptItems = loadedReceiptItems ?? NO_RECEIPT_ITEMS
    const products = loadedProducts ?? NO_PRODUCTS
    const receiptsLoading = loadedReceiptItems === undefined

    // Neue Ausgaben erscheinen sofort (optimistisch), bis das Speichern bestätigt und neu geladen ist.
    const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([])
    const expenses = useMemo(
        () => pendingExpenses.length > 0 ? [...pendingExpenses, ...serverExpenses] : serverExpenses,
        [pendingExpenses, serverExpenses]
    )

    // --- APP STATE ---
    const [view, setView] = useState<MainView>('entry')
    const [showGirokonto, setShowGirokonto] = useState(false)
    const [openFunAccountId, setOpenFunAccountId] = useState<number | null>(null)
    const [showFunHub, setShowFunHub] = useState(false)
    const [funSummary, setFunSummary] = useState<FunSummary>(initialFunSummary ?? null)
    // Neuer Stand vom Neuladen der Seite (app/page.tsx) → Kacheln übernehmen ihn direkt
    const [prevInitialFunSummary, setPrevInitialFunSummary] = useState(initialFunSummary)
    if (initialFunSummary !== prevInitialFunSummary) {
        setPrevInitialFunSummary(initialFunSummary)
        if (initialFunSummary !== undefined) setFunSummary(initialFunSummary)
    }
    const funSaldo = funSummary?.saldo ?? null
    const funAccountId = funSummary?.accountId ?? null
    const funCurrentGroup = funSummary?.currentGroup ?? null
    const [funRefresh, setFunRefresh] = useState(0)
    // Schnell-Ausgabe direkt in die aktuelle Gruppe (nur Ausgaben, keine Einnahmen)
    const [funGroupDialog, setFunGroupDialog] = useState(false)
    const [funGroupAmount, setFunGroupAmount] = useState('')
    const [funGroupDesc, setFunGroupDesc] = useState('')
    const [funGroupDate, setFunGroupDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [funGroupSaving, setFunGroupSaving] = useState(false)
    const [viewLevel, setViewLevel] = useState<'weeks' | 'days' | 'transactions'>('weeks')
    const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null)
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [historyMode, setHistoryMode] = useState<'calendar' | 'list' | 'analysis'>('calendar')
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
    const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(null)
    const [showAddSheet, setShowAddSheet] = useState(false)
    // Kassenbon-Scan: nur sichtbar, wenn in der Chefansicht freigeschaltet (app_metadata.receipt_scan)
    const receiptScan = useReceiptScanEnabled()
    const [showScanner, setShowScanner] = useState(false)
    const [scanPendingId, setScanPendingId] = useState<string | null>(null)
    const openScanner = (id: string | null) => { setScanPendingId(id); setShowScanner(true) }

    // Artikel (Bon-Positionen) nach Ausgabe gruppiert — optionale Zusatzinfo.
    const itemsByExpense = useMemo(() => {
        const map = new Map<number, ReceiptItem[]>()
        for (const item of receiptItems) {
            const list = map.get(item.expense_id)
            if (list) list.push(item)
            else map.set(item.expense_id, [item])
        }
        return map
    }, [receiptItems])

    // --- EFFECT: SPASSKONTO-SALDO + aktuelle Gruppe für die Dashboard-Kacheln laden ---
    // Lädt beim Start (außer die Seite hat es schon mitgeladen), wenn der Hub geschlossen
    // wird (showFunHub → false) und nach einer Schnell-Ausgabe (funRefresh).
    const funSummaryPreloaded = useRef(initialFunSummary !== undefined)
    useEffect(() => {
        if (showFunHub) return
        if (funSummaryPreloaded.current) { funSummaryPreloaded.current = false; return }
        let cancelled = false
        loadFunSummary().then(summary => { if (!cancelled) setFunSummary(summary) })
        return () => { cancelled = true }
    }, [showFunHub, funRefresh])

    // Bon-Artikel erst laden, wenn Historie (Liste mit Artikeln, Analyse → Einkäufe) geöffnet wird
    useEffect(() => {
        if (view === 'history' && receiptsLoading) onNeedReceipts?.()
    }, [view, receiptsLoading, onNeedReceipts])

    const openFunGroupDialog = () => {
        setFunGroupAmount('')
        setFunGroupDesc('')
        setFunGroupDate(format(new Date(), 'yyyy-MM-dd'))
        setFunGroupDialog(true)
    }

    const handleSaveFunGroupExpense = async () => {
        if (!funAccountId || !funCurrentGroup) return
        const amount = parseFloat(funGroupAmount)
        if (isNaN(amount) || amount <= 0 || !funGroupDate) return
        setFunGroupSaving(true)
        const result = await addFunGroupExpense(funAccountId, amount, funGroupDesc, funGroupDate, funCurrentGroup.id)
        setFunGroupSaving(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Speichern')
            return
        }
        setFunGroupDialog(false)
        setFunRefresh(n => n + 1)
    }

    // Eintrag-Formular vorwärmen (Emoji-/Betragsschrift), sobald der Browser nach dem Start Luft hat
    useEffect(() => {
        if (typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(warmUpExpenseForm, { timeout: 1500 })
            return () => window.cancelIdleCallback(id)
        }
        const t = setTimeout(warmUpExpenseForm, 500)
        return () => clearTimeout(t)
    }, [])

    // Unteransichten im Leerlauf nach dem ersten Anzeigen vorladen
    useEffect(() => {
        if (typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(preloadSubViews, { timeout: 2000 })
            return () => window.cancelIdleCallback(id)
        }
        const t = setTimeout(preloadSubViews, 800)
        return () => clearTimeout(t)
    }, [])

    // PDF-Bibliothek im Hintergrund laden, sobald der PDF-Knopf (Historie → Liste) sichtbar ist
    useEffect(() => {
        if (view === 'history' && historyMode === 'list') preloadPdf().catch(() => {})
    }, [view, historyMode])

    // --- EFFECT: PROCESS SAVINGS & DISTRIBUTION ON MOUNT ---
    // Wochensparen, Spaßkonto-Feeds und Verteilkonten laufen gebündelt in einer
    // Server Action (app/actions/startup.ts) statt in 5–6 Abfragen aus dem Browser.
    useEffect(() => {
        console.log('--- Init Dashboard ---')
        loadTheme()
        // Erst wenn die Startseite steht und der Browser Luft hat — die Jobs sollen nicht mit
        // dem Laden der Daten und dem ersten Eintragen um Netz und CPU konkurrieren.
        const run = () => runStartupJobs()
            .then(result => { if (result.changed) onUpdate?.() })
            .catch(err => console.error('Start-Jobs fehlgeschlagen:', err))
        if (typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(run, { timeout: 3000 })
            return () => window.cancelIdleCallback(id)
        }
        const t = setTimeout(run, 1500)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Run ONCE on mount. onUpdate dependency caused infinite loop.

    // --- CALCULATE GIROKONTO BALANCE (Dynamic Net Cashflow) ---
    // Einmal rechnen und an Girokonto- und Analyse-Ansicht weiterreichen. Die Simulation
    // läuft bis "heute" — der Tag gehört daher in die Abhängigkeiten.
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    const girokontoTimeline = useMemo(
        () => calculateGirokontoTimeline(expenses, initialIncomeSources, initialFixedCosts),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [expenses, initialFixedCosts, initialIncomeSources, todayKey]
    )
    const giroData = useMemo(() => {
        if (expenses.length === 0 && initialIncomeSources.length === 0) return { finalBalance: 0, timeline: [] as { date: Date; balance: number }[] }
        return { finalBalance: girokontoTimeline.finalBalance, timeline: girokontoTimeline.timeline }
    }, [expenses, initialIncomeSources, girokontoTimeline])
    const currentGiroBalance = giroData.finalBalance

    const handleLogout = async () => {
        await supabase.auth.signOut()
        // Page.tsx will handle the redirect/unmount
    }

    const updateExpenseLocal = async (id: number, formData: FormData) => {
        const description = formData.get('description') as string
        const amount = parseFloat(formData.get('amount') as string)
        const expense_date = formData.get('date') as string
        const category = formData.get('category') as string || 'Sonstiges'

        // Umbuchung Girokonto <-> Spaßkonto: beide Seiten bekommen denselben Betrag. Das Vorzeichen
        // (Abbuchen/Hinzufügen) bleibt erhalten, die Kategorie bleibt "Umbuchung".
        const existing = expenses.find(e => e.id === id)
        if (existing?.transfer_id) {
            const result = await updateTransfer(existing.transfer_id, {
                amount: Math.abs(amount),
                reason: description || existing.description,
                date: expense_date,
            })
            if (!result.success) alert(result.error)
            onUpdate?.()
            return
        }

        // Manuelle Buchungen / alte Umbuchungen behalten ihre Kategorie (sonst würden sie still zur Ausgabe).
        await supabase.from('expenses').update(expenseEditPatch(existing, { description, amount, expense_date, category })).eq('id', id)
        onUpdate?.(['expenses'])
    }

    const deleteExpenseLocal = async (id: number) => {
        // 1. Get the expense to check for linked account
        const { data: expense } = await supabase.from('expenses').select('*').eq('id', id).single()

        // Umbuchung Girokonto <-> Spaßkonto: beide Seiten zusammen löschen (Spaßkonto-Saldo wird korrigiert)
        if (expense?.transfer_id) {
            const result = await deleteTransfer(expense.transfer_id)
            if (!result.success) alert(result.error)
            onUpdate?.()
            return
        }

        if (expense?.account_id) {
            // 2. Fetch account
            const { data: account } = await supabase.from('accounts').select('*').eq('id', expense.account_id).single()
            if (account) {
                // 3. Refund the amount
                const { error: refundError } = await supabase.from('accounts').update({
                    amount: account.amount + Number(expense.amount)
                }).eq('id', account.id)

                if (refundError) console.error('Error refunding account:', refundError)
            }
        }

        // 4. Delete attached receipt items (optionale Zusatzinfo, sonst Waisen)
        await supabase.from('receipt_items').delete().eq('expense_id', id)

        // 5. Delete the expense
        await supabase.from('expenses').delete().eq('id', id)
        onUpdate?.(expense?.account_id ? ['expenses', 'accounts', 'receipts'] : ['expenses', 'receipts'])
    }

    // Neue Ausgabe (normales Budget): sofort anzeigen und Formular schließen, im Hintergrund
    // speichern. Schlägt das Speichern fehl, verschwindet sie wieder und es kommt die Fehlermeldung.
    const addExpenseOptimistic = (draft: Pick<Expense, 'description' | 'amount' | 'expense_date' | 'category'>, save: () => Promise<void>) => {
        const temp: Expense = {
            ...draft,
            id: -Date.now(),
            created_at: new Date().toISOString(),
            account_id: null,
            transfer_id: null,
        }
        setPendingExpenses(list => [temp, ...list])
        setShowAddSheet(false)
        save()
            .then(() => onUpdate?.(['expenses']), (err: Error) => alert(err?.message || 'Fehler beim Speichern.'))
            .finally(() => setPendingExpenses(list => list.filter(e => e !== temp)))
    }

    const handleEditSave = async (formData: FormData) => {
        if (!editingExpense) return
        await updateExpenseLocal(editingExpense.id, formData)
        setEditingExpense(null)
    }

    // Budget Calculations
    // Budget Calculations
    const CONST_WEEKS_PER_MONTH = 4.33
    // FIXED: Filter expired fixed costs
    const activeFixedCostsForBudget = initialFixedCosts.filter(fc => {
        const now = new Date()
        const from = fc.valid_from ? new Date(fc.valid_from) : null
        const to = fc.valid_to ? new Date(fc.valid_to) : null
        if (from && now < from) return false
        if (to && now > to) return false
        return true
    })
    const totalFixed = activeFixedCostsForBudget.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const weeklyFixedCosts = totalFixed / CONST_WEEKS_PER_MONTH

    // --- DYNAMIC WEEKLY INCOME CALCULATION ---
    const now = new Date()
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 }) // Sunday

    const calculateWeeklyIncome = () => {
        // Fallback to static budget if no sources defined
        if (initialIncomeSources.length === 0) {
            return initialBudget / CONST_WEEKS_PER_MONTH
        }

        return initialIncomeSources.reduce((sum, src) => {
            const from = src.valid_from ? new Date(src.valid_from) : null
            const to = src.valid_to ? new Date(src.valid_to) : null

            // Check if source is active/valid in general for this period
            // If from/to are defined, they must overlap with current week
            // Actually, we need to distinguish One-Time vs Recurring

            // 1. One-Time Income (Project work, etc)
            // Logic: If the income's VALIDITY range is fully contained within this week?
            // User said: "wenn der bereich einer einnahme in dieser woche anfängt und endet"
            if (from && to && from >= currentWeekStart && to <= currentWeekEnd) {
                return sum + Number(src.amount)
            }

            // 2. Regular Income (Monthly/Weekly)
            // Check if active ('from' is before end of week, 'to' is after start of week)
            const isActive = (!from || from <= currentWeekEnd) && (!to || to >= currentWeekStart)

            if (isActive) {
                // If it's a one-time income that spans multiple weeks, we might treat it differently?
                // But user differentiation was "starts and ends in this week".
                // If it doesn't default to monthly logic?
                // We rely on 'frequency' if available, defaulting to monthly.

                switch (src.frequency) {
                    case 'daily': return sum + (Number(src.amount) * 7)
                    case 'weekly': return sum + Number(src.amount)
                    case 'yearly': return sum + (Number(src.amount) / 52)
                    case 'monthly':
                    default:
                        return sum + (Number(src.amount) / CONST_WEEKS_PER_MONTH)
                }
            }
            return sum
        }, 0)
    }

    const weeklyIncome = calculateWeeklyIncome()

    // Expenses for CURRENT WEEK ONLY
    // Account-paid expenses (savings/fun) are budget-neutral and excluded.
    // Memoisiert: läuft sonst bei jedem Rendern (z. B. jedem Tastendruck) über alle Ausgaben.
    // Die Woche steckt als Zeitstempel in den Abhängigkeiten, Montag/Sonntag folgen daraus.
    const currentWeekStartTime = currentWeekStart.getTime()
    const relevantExpensesThisWeek = useMemo(() => {
        const start = new Date(currentWeekStartTime)
        const end = endOfWeek(start, { weekStartsOn: 1 })
        return expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at)
            // Umbuchungen/manuelle Buchungen zählen nicht (Entscheidung 13.10.: kein Verbrauch, nur Kontostand).
            return isWithinInterval(d, { start, end }) && isSpendingExpense(e)
        })
    }, [expenses, currentWeekStartTime])

    const totalSpentThisWeek = relevantExpensesThisWeek.reduce((acc, curr) => acc + Number(curr.amount), 0)

    // "Verfügbar (Woche)" = Weekly Income - Weekly Fixed - Spent This Week
    // We define weeklyBudget as the amount available BEFORE variable expenses
    const weeklyBudget = weeklyIncome - weeklyFixedCosts

    const currentBalance = weeklyBudget - totalSpentThisWeek
    const isPositive = currentBalance >= 0

    // (Unused legacy variables commented out/removed to clean up)
    // const weeklyGrossBudget = ...
    // const weeksPassed = ...
    // const totalAccumulatedBudget = ...

    const getDate = (e: Expense) => new Date(e.expense_date || e.created_at)

    // Groups logic (nur von expenses abhängig → memoisiert)
    const weeklyGroups = useMemo(() => {
        const getDate = (e: Expense) => new Date(e.expense_date || e.created_at)
        const groups: Record<string, { start: Date, total: number, count: number }> = {}
        expenses.forEach(e => {
            const date = getDate(e)
            const start = startOfWeek(date, { weekStartsOn: 1 })
            const key = start.toISOString()
            if (!groups[key]) groups[key] = { start, total: 0, count: 0 }
            if (isTransferExpense(e)) return // Umbuchungen: keine Ausgabe, zählen weder in Summe noch Anzahl
            groups[key].total += Number(e.amount)
            groups[key].count += 1
        })
        return Object.values(groups).sort((a, b) => b.start.getTime() - a.start.getTime())
    }, [expenses])
    const getWeeklyGroups = () => weeklyGroups
    const getDailyGroups = () => {
        if (!selectedWeekStart) return []
        const weekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 })
        const weekExpenses = expenses.filter(e => isWithinInterval(getDate(e), { start: selectedWeekStart, end: weekEnd }))
        const groups: Record<string, { date: Date, total: number, count: number }> = {}
        weekExpenses.forEach(e => {
            const date = getDate(e)
            const key = format(date, 'yyyy-MM-dd')
            if (!groups[key]) groups[key] = { date, total: 0, count: 0 }
            if (isTransferExpense(e)) return // Umbuchungen: keine Ausgabe, zählen weder in Summe noch Anzahl
            groups[key].total += Number(e.amount)
            groups[key].count += 1
        })
        return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime())
    }
    const getTransactions = () => {
        if (!selectedDay) return []
        return expenses
            .filter(e => isSameDay(getDate(e), selectedDay))
            .sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
    }
    // Navigation
    const handleWeekClick = (start: Date) => { setSelectedWeekStart(start); setViewLevel('days') }
    const handleDayClick = (date: Date) => { setSelectedDay(date); setViewLevel('transactions') }
    const handleBackHistory = () => {
        if (viewLevel === 'transactions') setViewLevel('days')
        else if (viewLevel === 'days') { setViewLevel('weeks'); setSelectedWeekStart(null) }
    }
    const handleCalendarDayClick = (date: Date) => {
        const start = startOfWeek(date, { weekStartsOn: 1 })
        setSelectedWeekStart(start)
        setSelectedDay(date)
        setViewLevel('transactions')
        setHistoryMode('list')
    }

    // PDF Export
    const generatePDF = () => withPdf(pdf => downloadExpensesPdf(pdf, expenses, weeklyBudget))

    // --- FOKUS-RING & INSIGHTS (derived display data, no new logic) ---
    const isoDay = ((now.getDay() + 6) % 7) + 1 // Mo=1 … So=7
    const daysLeftInWeek = 8 - isoDay
    const dailyAllowance = daysLeftInWeek > 0 ? currentBalance / daysLeftInWeek : currentBalance
    const RING_R = 96
    const RING_CIRC = 2 * Math.PI * RING_R
    const ringProgress = !isPositive ? 1 : (weeklyBudget > 0 ? Math.min(1, Math.max(0, currentBalance / weeklyBudget)) : 0)

    // Girokonto sparkline: letzte 30 Tage, normalisiert auf 100x36 viewBox
    const sparkPoints = (() => {
        const tl = giroData.timeline.slice(-30)
        if (tl.length < 2) return ''
        const vals = tl.map(t => t.balance)
        const min = Math.min(...vals)
        const range = (Math.max(...vals) - min) || 1
        return tl.map((t, i) => `${((i / (tl.length - 1)) * 100).toFixed(1)},${(33 - ((t.balance - min) / range) * 30).toFixed(1)}`).join(' ')
    })()

    // Nächste Fixkosten-Abbuchung (nur wenn execution_day gepflegt ist)
    const nextFixedCost = (() => {
        const today = now.getDate()
        const dim = getDaysInMonth(now)
        let best: { title: string; amount: number; days: number } | null = null
        for (const fc of activeFixedCostsForBudget) {
            if (!fc.execution_day) continue
            let d = fc.execution_day - today
            if (d < 0) d += dim
            if (best === null || d < best.days) best = { title: fc.title, amount: Number(fc.amount), days: d }
        }
        return best
    })()

    // Kategorie-Trend: größte Kategorie dieser Woche vs. Ø der 4 Vorwochen
    // (memoisiert; Eingaben: Ausgaben, aktuelle Woche und Wochentag)
    const categoryInsight = useMemo(() => {
        const currentWeekStart = new Date(currentWeekStartTime)
        const getDate = (e: Expense) => new Date(e.expense_date || e.created_at)
        if (relevantExpensesThisWeek.length === 0) return null
        const catTotals: Record<string, number> = {}
        relevantExpensesThisWeek.forEach(e => {
            const c = e.category || 'Sonstiges'
            catTotals[c] = (catTotals[c] || 0) + Number(e.amount)
        })
        const [topCat, topAmt] = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]
        const prevStart = new Date(currentWeekStart)
        prevStart.setDate(prevStart.getDate() - 28)
        const prevSpend = expenses.filter(e => {
            const d = getDate(e)
            // isSpendingExpense statt nur 'Konto:'-Prefix, damit der 4-Wochen-Schnitt
            // dieselbe Basis hat wie die aktuelle Woche (Fun-/Konto-Zahlungen ausgenommen).
            return d >= prevStart && d < currentWeekStart && (e.category || 'Sonstiges') === topCat && isSpendingExpense(e)
        }).reduce((s, e) => s + Number(e.amount), 0)
        const avgPrev = prevSpend / 4
        if (avgPrev <= 0) return null
        // Woche läuft noch: Vergleich auf anteiliges Wochenbudget hochrechnen
        const projected = (topAmt / isoDay) * 7
        const pct = Math.round(((projected - avgPrev) / avgPrev) * 100)
        return { category: topCat, pct }
    }, [relevantExpensesThisWeek, expenses, currentWeekStartTime, isoDay])

    const openFunAccount = openFunAccountId !== null
        ? initialAccounts.find(a => a.id === openFunAccountId)
        : null

    if (openFunAccount) {
        const feedCost = initialFixedCosts.find(fc => fc.linked_account_id === openFunAccount.id)
        return (
            <FunAccountView
                account={openFunAccount}
                monthlyFeed={feedCost ? Number(feedCost.amount) : null}
                expenses={expenses}
                onBack={() => setOpenFunAccountId(null)}
                onUpdate={onUpdate}
            />
        )
    }

    if (showFunHub) {
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
                <FunAccountHub onBack={() => setShowFunHub(false)} onUpdate={onUpdate} />
            </div>
        )
    }

    if (showGirokonto) {
        return (
            <GirokontoView
                expenses={expenses}
                incomeSources={initialIncomeSources}
                initialFixedCosts={initialFixedCosts}
                currentGiroBalance={currentGiroBalance} // Pass the "True" value
                girokontoTimeline={girokontoTimeline}
                onUpdate={onUpdate}
                onBack={() => setShowGirokonto(false)}
            />
        )
    }

    return (
        <div id="dashboard-container" className="fixed inset-0 h-[100dvh] w-screen overflow-hidden relative transition-colors duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground">

            {/* === ENTRY VIEW: FOKUS-RING (Konzept A) + INSIGHTS (Konzept B) === */}
            {view === 'entry' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden relative scroll-smooth view-enter">
                    <div className="w-full max-w-lg mx-auto px-6 flex flex-col items-center pt-12 pb-40 min-h-full">

                        <p className="eyebrow mb-7">Verfügbar diese Woche</p>

                        {/* BUDGET-RING */}
                        <div data-tour="budget-ring" className="relative aspect-square w-[min(64vw,240px)]" role="img" aria-label={`Noch €${Math.round(currentBalance)} von €${Math.round(weeklyBudget)} Wochenbudget verfügbar`}>
                            <svg viewBox="0 0 220 220" className="w-full h-full -rotate-90">
                                <circle cx="110" cy="110" r={RING_R} fill="none" stroke="var(--bg-muted)" strokeWidth="14" />
                                <circle
                                    cx="110" cy="110" r={RING_R} fill="none"
                                    stroke={isPositive ? 'var(--color-primary)' : 'var(--chart-neg-heavy)'}
                                    strokeWidth="14" strokeLinecap="round"
                                    strokeDasharray={`${(ringProgress * RING_CIRC).toFixed(1)} ${RING_CIRC.toFixed(1)}`}
                                    className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-strong)]"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`amount text-[clamp(1.75rem,9vw,3rem)] leading-none font-light ${isPositive ? 'text-foreground' : 'text-[var(--chart-neg-heavy)]'}`}>
                                    €{Math.round(currentBalance)}
                                </span>
                                <span className="text-[clamp(0.65rem,2.8vw,0.75rem)] text-muted-foreground mt-1.5">von €{Math.round(weeklyBudget)} Budget</span>
                            </div>
                        </div>

                        <p data-tour="daily-budget" className="text-sm text-muted-foreground mt-6">
                            Noch {daysLeftInWeek} {daysLeftInWeek === 1 ? 'Tag' : 'Tage'} · <span className="amount font-medium text-primary">€{Math.max(0, dailyAllowance).toFixed(0)} / Tag</span>
                        </p>

                        {/* STATS */}
                        <div className="w-full grid grid-cols-2 gap-2.5 mt-9">
                            {/* Kassenbon-Scan: nur wenn ein Bon offen ist oder gerade gelesen wird, erscheint hier
                                eine Zusatz-Kachel über den üblichen. Sonst sieht die Startseite aus wie ohne Scan. */}
                            {receiptScan && (
                                <PendingReceiptTile onSaved={() => onUpdate?.(['expenses', 'receipts'])} onOpen={openScanner} />
                            )}
                            <div className="surface p-4">
                                <p className="text-xs text-muted-foreground">Ausgegeben</p>
                                <p className="amount text-lg text-foreground mt-1">€{totalSpentThisWeek.toFixed(2)}</p>
                            </div>
                            <div className="surface p-4">
                                <p className="text-xs text-muted-foreground">Wochenbudget</p>
                                <p className="amount text-lg text-foreground mt-1">€{weeklyBudget.toFixed(2)}</p>
                            </div>
                            {funSaldo !== null && (
                                <>
                                    <button
                                        data-tour="fun-tile"
                                        onClick={() => setShowFunHub(true)}
                                        className="surface press p-4 text-left group"
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                                                Spaßkonto
                                            </p>
                                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.75} />
                                        </div>
                                        <p className={`amount text-lg mt-1 ${funSaldo < 0 ? 'text-[var(--chart-neg-heavy)]' : 'text-foreground'}`}>
                                            {funSaldo < 0 ? '−' : ''}€{Math.abs(funSaldo).toFixed(2)}
                                        </p>
                                    </button>
                                    {funCurrentGroup ? (
                                        <button
                                            onClick={openFunGroupDialog}
                                            className="surface press p-4 text-left group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs text-muted-foreground">Aktuelle Gruppe</p>
                                                <Plus className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
                                            </div>
                                            <p className="text-lg font-semibold text-foreground mt-1 truncate">{funCurrentGroup.name}</p>
                                        </button>
                                    ) : (
                                        <div className="surface p-4">
                                            <p className="text-xs text-muted-foreground">Aktuelle Gruppe</p>
                                            <p className="text-sm text-muted-foreground/70 mt-1.5">Keine aktive</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* SCHNELL-AUSGABE IN DIE AKTUELLE GRUPPE */}
                        <Dialog open={funGroupDialog} onOpenChange={setFunGroupDialog}>
                            <DialogContent className="rounded-3xl max-w-sm">
                                <DialogHeader>
                                    <DialogTitle>Neue Ausgabe</DialogTitle>
                                    <DialogDescription>
                                        Wird direkt in die Gruppe &bdquo;{funCurrentGroup?.name}&ldquo; eingetragen.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3">
                                    {/* Kein autoFocus: der Nutzer entscheidet per Tipp, wo er schreibt. */}
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        placeholder="Betrag (€)"
                                        value={funGroupAmount}
                                        onChange={e => setFunGroupAmount(e.target.value)}
                                        className="h-12 rounded-2xl text-lg text-center font-bold"
                                    />
                                    <Input
                                        placeholder="Beschreibung (optional)"
                                        value={funGroupDesc}
                                        onChange={e => setFunGroupDesc(e.target.value)}
                                        className="h-12 rounded-2xl"
                                    />
                                    <DatePicker date={funGroupDate} setDate={setFunGroupDate} className="h-12 rounded-2xl" />
                                    <Button
                                        onClick={handleSaveFunGroupExpense}
                                        disabled={funGroupSaving || !funGroupAmount || !funGroupDate}
                                        className="w-full h-12 rounded-2xl font-bold"
                                    >
                                        {funGroupSaving ? 'Speichert…' : 'Speichern'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>

                        {/* INSIGHTS */}
                        <section className="w-full mt-10">
                            <h2 className="flex items-center gap-4 mb-4">
                                <span className="eyebrow">Insights</span>
                                <span className="h-px flex-1 bg-border" aria-hidden="true"></span>
                            </h2>
                            <div className="stagger-children flex flex-col gap-2.5">

                                {categoryInsight && Math.abs(categoryInsight.pct) >= 10 && (
                                    <div className="surface p-4 flex items-center gap-3">
                                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${categoryInsight.pct < 0 ? 'bg-[var(--chart-pos)]/12 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg)]/12 text-[var(--chart-neg-heavy)]'}`}>
                                            {categoryInsight.pct < 0 ? <TrendingDown className="w-4.5 h-4.5" strokeWidth={1.75} /> : <TrendingUp className="w-4.5 h-4.5" strokeWidth={1.75} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground">{categoryInsight.category} {categoryInsight.pct < 0 ? 'läuft gut' : 'läuft heiß'}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{Math.abs(categoryInsight.pct)} % {categoryInsight.pct < 0 ? 'unter' : 'über'} deinem 4-Wochen-Schnitt</p>
                                        </div>
                                    </div>
                                )}
                                {categoryInsight && Math.abs(categoryInsight.pct) < 10 && (
                                    <div className="surface p-4 flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                                            <Check className="w-4.5 h-4.5" strokeWidth={1.75} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground">{categoryInsight.category} im üblichen Rahmen</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">nahe an deinem 4-Wochen-Schnitt</p>
                                        </div>
                                    </div>
                                )}

                                <button data-tour="giro-card" onClick={() => setShowGirokonto(true)} className="surface press w-full p-4 text-left group">
                                    <div className="flex justify-between items-baseline">
                                        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                            Girokonto
                                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.75} />
                                        </p>
                                        <p className={`amount text-sm ${currentGiroBalance < 0 ? 'text-[var(--chart-neg-heavy)]' : 'text-foreground'}`}>€{currentGiroBalance.toFixed(2)}</p>
                                    </div>
                                    {sparkPoints && (
                                        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="w-full h-9 mt-2" aria-hidden="true">
                                            <polyline points={sparkPoints} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                        </svg>
                                    )}
                                </button>

                                {/* Spaßkonten — Logik aus dem Fun-Account-Branch, Optik ans neue Design angepasst */}
                                {initialAccounts.filter(a => a.type === 'fun').map(acc => {
                                    const feedCost = initialFixedCosts.find(fc => fc.linked_account_id === acc.id)
                                    return (
                                        <button key={acc.id} onClick={() => setOpenFunAccountId(acc.id)} className="surface press w-full p-4 text-left group">
                                            <div className="flex items-center gap-3">
                                                <span className="w-9 h-9 rounded-xl bg-[var(--color-primary)]/12 text-primary flex items-center justify-center shrink-0">
                                                    <Sparkles className="w-4.5 h-4.5" strokeWidth={1.75} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-foreground truncate">{acc.name}</p>
                                                    {feedCost && Number(feedCost.amount) > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-0.5"><span className="amount">+€{Number(feedCost.amount).toFixed(2)}</span> / Monat</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="amount text-sm text-foreground">€{Number(acc.amount).toFixed(2)}</p>
                                                    <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}

                                {nextFixedCost && (
                                    <div className="surface p-4 flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                                            <CalendarClock className="w-4.5 h-4.5" strokeWidth={1.75} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground truncate">{nextFixedCost.title} {nextFixedCost.days === 0 ? 'heute' : nextFixedCost.days === 1 ? 'morgen' : `in ${nextFixedCost.days} Tagen`}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5"><span className="amount">−€{nextFixedCost.amount.toFixed(2)}</span> · ist im Budget eingeplant</p>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </section>

                    </div>
                </div>
            )}

            {/* === HISTORY VIEW === */}
            {view === 'history' && (
                <HistoryView
                    historyMode={historyMode}
                    setHistoryMode={setHistoryMode}
                    viewLevel={viewLevel}
                    handleBackHistory={handleBackHistory}
                    handleCalendarDayClick={handleCalendarDayClick}
                    handleWeekClick={handleWeekClick}
                    handleDayClick={handleDayClick}
                    getWeeklyGroups={getWeeklyGroups}
                    getDailyGroups={getDailyGroups}
                    getTransactions={getTransactions}
                    expandedExpenseId={expandedExpenseId}
                    setExpandedExpenseId={setExpandedExpenseId}
                    setEditingExpense={setEditingExpense}
                    deleteExpenseLocal={deleteExpenseLocal}
                    itemsByExpense={itemsByExpense}
                    generatePDF={generatePDF}
                    expenses={expenses}
                    weeklyBudget={weeklyBudget}
                    currentGiroBalance={currentGiroBalance}
                    girokontoTimeline={girokontoTimeline}
                    initialFixedCosts={initialFixedCosts}
                    initialAccounts={initialAccounts}
                    initialIncomeSources={initialIncomeSources}
                    receiptItems={receiptItems}
                    products={products}
                    receiptsLoading={receiptsLoading}
                />
            )}

            {/* === SETTINGS VIEW === */}
            {view === 'settings' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden relative scroll-smooth view-enter">
                    <div className="w-full max-w-lg mx-auto px-6 pt-14 pb-36 min-h-full">
                        <SettingsOverlay
                            settings={initialSettings}
                            fixedCosts={initialFixedCosts}
                            accounts={initialAccounts}
                            incomeSources={initialIncomeSources}
                            onLogout={handleLogout}
                            onUpdate={onUpdate}
                            expenses={expenses}
                            onBack={() => setView('entry')}
                        />
                    </div>
                </div>
            )}

            {/* === BOTTOM DOCK: Historie · [Center: + auf Startseite / Home sonst] · Einstellungen === */}
            <div className="fixed bottom-0 left-0 w-full flex justify-center z-40 pointer-events-none px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] transition-opacity duration-200 in-data-[keyboard=open]:opacity-0 in-data-[keyboard=open]:pointer-events-none">
                <div className="flex w-full max-w-lg items-center gap-1.5 pointer-events-auto bg-card/85 backdrop-blur-md border border-border rounded-2xl p-1.5 shadow-lg shadow-foreground/5">

                    <button
                        data-tour="nav-history"
                        onClick={() => setView('history')}
                        aria-label="Historie"
                        aria-current={view === 'history' ? 'page' : undefined}
                        className={`press flex-1 h-14 rounded-xl flex items-center justify-center transition-colors duration-250 ease-[var(--ease-out-strong)] ${
                            view === 'history' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                        <List className="w-6 h-6" strokeWidth={1.75} />
                    </button>

                    {/* Center: auf der Startseite Ausgabe hinzufügen, sonst zurück zur Startseite */}
                    <button
                        data-tour="add-button"
                        onClick={() => view === 'entry' ? setShowAddSheet(true) : setView('entry')}
                        aria-label={view === 'entry' ? 'Neue Ausgabe hinzufügen' : 'Zur Startseite'}
                        className="press flex-[1.4] h-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25 transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)]"
                    >
                        {view === 'entry'
                            ? <Plus className="w-7 h-7" strokeWidth={2} />
                            : <Home className="w-6 h-6" strokeWidth={2} />}
                    </button>

                    <button
                        data-tour="nav-settings"
                        onClick={() => setView('settings')}
                        aria-label="Einstellungen"
                        aria-current={view === 'settings' ? 'page' : undefined}
                        className={`press flex-1 h-14 rounded-xl flex items-center justify-center transition-colors duration-250 ease-[var(--ease-out-strong)] ${
                            view === 'settings' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                        <Settings className="w-6 h-6" strokeWidth={1.75} />
                    </button>

                </div>
            </div>

            {/* Edit Expense Dialog */}
            <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
                <DialogContent className="sm:max-w-[400px] top-[calc(50%-var(--kb-inset)/2)] max-h-[calc(100dvh-var(--kb-inset)-2rem)] overflow-y-auto overscroll-contain rounded-3xl p-6 bg-card border border-border shadow-xl mx-4 max-w-[calc(100%-2rem)] transition-[top] duration-200 ease-[var(--ease-drawer)]">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-semibold tracking-tight text-foreground text-left">Eintrag bearbeiten</DialogTitle>
                        <DialogDescription className="sr-only">Passe die Details deiner Ausgabe an.</DialogDescription>
                    </DialogHeader>
                    <form action={handleEditSave} className="space-y-4 mt-2">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground pl-1">Datum</label>
                            <input
                                type="date"
                                name="date"
                                defaultValue={editingExpense?.expense_date ? new Date(editingExpense.expense_date).toISOString().split('T')[0] : (editingExpense?.created_at ? new Date(editingExpense.created_at).toISOString().split('T')[0] : '')}
                                required
                                onClick={(e) => e.currentTarget.showPicker()}
                                className="amount w-full text-base px-4 py-3 rounded-xl bg-muted/60 border border-transparent outline-none transition-[background-color,border-color] duration-200 focus:bg-card focus:border-border cursor-pointer text-foreground"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground pl-1">Kategorie</label>
                            <select
                                name="category"
                                defaultValue={editingExpense?.category || 'Sonstiges'}
                                className="w-full text-base font-medium px-4 py-3 rounded-xl bg-muted/60 border border-transparent outline-none transition-[background-color,border-color] duration-200 focus:bg-card focus:border-border appearance-none text-foreground"
                            >
                                <option value="Essen">Essen 🍔</option>
                                <option value="Schminki Schminki">Schminki Schminki 💄</option>
                                <option value="Shoppi">Shoppi 🛍️</option>
                                <option value="Freizeit">Freizeit 🎉</option>
                                <option value="Sparen">Sparen 💰</option>
                                <option value="Sonstiges">Sonstiges 📦</option>
                                {editingExpense && isTransferExpense(editingExpense) && editingExpense.category && (
                                    <option value={editingExpense.category}>{editingExpense.category} ⇄</option>
                                )}
                            </select>
                        </div>
                        <input type="hidden" name="description" value="" />
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground pl-1">Betrag</label>
                            <Input
                                type="number"
                                name="amount"
                                step="0.01"
                                inputMode="decimal"
                                defaultValue={editingExpense?.amount}
                                placeholder="0,00"
                                required
                                className="amount w-full text-2xl text-center px-4 py-3 rounded-xl bg-muted/60 border border-transparent outline-none transition-[background-color,border-color] duration-200 focus:bg-card focus:border-border placeholder:text-muted-foreground/50 h-auto text-foreground shadow-none"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="press w-full text-base font-semibold bg-primary text-primary-foreground rounded-xl py-6 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] transition-colors duration-200 h-auto shadow-none"
                        >
                            Speichern
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Neue Ausgabe — Bottom Sheet (FAB) */}
            <Dialog open={showAddSheet} onOpenChange={setShowAddSheet}>
                <DialogContent className="top-auto bottom-[var(--kb-inset)] left-0 right-0 translate-x-0 translate-y-0 w-full max-w-full sm:max-w-full max-h-[calc(100dvh-var(--kb-inset)-1rem)] overflow-y-auto overscroll-contain rounded-t-3xl rounded-b-none border-t border-x-0 border-b-0 border-border bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl transition-[bottom] duration-200 ease-[var(--ease-drawer)] data-open:slide-in-from-bottom-10 data-closed:slide-out-to-bottom-10 in-data-[keyboard=open]:pb-6">
                    <DialogHeader className="max-w-md mx-auto w-full">
                        <DialogTitle className="font-display text-xl font-semibold tracking-tight text-foreground text-left">Neue Ausgabe</DialogTitle>
                        <DialogDescription className="sr-only">Trage eine neue Ausgabe ein.</DialogDescription>
                    </DialogHeader>
                    <div className="max-w-md mx-auto w-full">
                        {receiptScan && (
                            <button
                                onClick={() => { setShowAddSheet(false); openScanner(null) }}
                                className="press w-full flex items-center justify-center gap-2 mb-4 py-3.5 rounded-xl font-semibold text-sm bg-muted text-foreground"
                            >
                                <ScanLine className="w-4 h-4" strokeWidth={1.75} />
                                Bon scannen
                            </button>
                        )}
                        <AddExpenseForm
                            accounts={initialAccounts}
                            onRefresh={() => { setShowAddSheet(false); onUpdate?.() }}
                            onOptimisticAdd={addExpenseOptimistic}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Beleg-Scanner (Vollbild) */}
            {showScanner && (
                <div className="fixed inset-0 z-[70] bg-background">
                    <ReceiptScanView
                        pendingId={scanPendingId}
                        onPendingChange={setScanPendingId}
                        onBack={() => {
                            // Nur die Ansicht schließen: offene Bons und laufende Auswertungen bleiben bestehen.
                            setShowScanner(false)
                            setScanPendingId(null)
                        }}
                        onSaved={() => onUpdate?.(['expenses', 'receipts'])}
                    />
                </div>
            )}

        </div>
    )
}