'use client'

import { useState, useEffect, useMemo } from 'react'
import { applyTheme, loadTheme, getSavedTheme, THEMES } from '@/utils/theme'
import { ChevronRight, LogOut, Download, Upload, FileText, HelpCircle, Sparkles } from 'lucide-react'
import ImportWizard from '@/components/ImportWizard'
import HelpModal from '@/components/HelpModal'
import AccountLegalSection from '@/components/legal/AccountLegalSection'
// Set worker source for pdfjs
import { preloadPdf, withPdf } from '@/lib/pdf'
import FunAccountHub from '@/components/FunAccountHub'
import { Expense, FixedCost, Settings, Account, IncomeSource } from '@/app/types'
import { Button } from '@/components/ui/button'
import { useIncomeEditor } from '@/components/settings/useIncomeEditor'
import { useAccountEditor } from '@/components/settings/useAccountEditor'
import { useFixedCostEditor } from '@/components/settings/useFixedCostEditor'
import AccountsView from '@/components/settings/AccountsView'
import FixedCostsView from '@/components/settings/FixedCostsView'
import IncomeView from '@/components/settings/IncomeView'
import { downloadFullReport } from '@/components/settings/fullReport'
import { restoreBackup } from '@/components/settings/restoreBackup'

type SettingsOverlayProps = {
    onBack: () => void
    settings: Settings
    fixedCosts: FixedCost[]
    accounts?: Account[]
    incomeSources: IncomeSource[]
    onLogout: () => void
    onUpdate?: () => void
    expenses: Expense[]
}

export default function SettingsOverlay({ onBack, settings, fixedCosts, accounts = [], incomeSources = [], onLogout, onUpdate, expenses }: SettingsOverlayProps) {
    // const [budget, setBudget] = useState<string | number>(settings?.monthly_budget || 0) // REMOVED: Calculated dynamically now
    const [showImportWizard, setShowImportWizard] = useState(false)
    const [showHelp, setShowHelp] = useState(false)
    const [showFixedCosts, setShowFixedCosts] = useState(false)
    const [showFunHub, setShowFunHub] = useState(false)

    // Income Sources State
    const [showIncome, setShowIncome] = useState(false)

    // Accounts State
    // Accounts State
    const [showAccounts, setShowAccounts] = useState(false)

    const incomeEditor = useIncomeEditor(onUpdate)
    const accountEditor = useAccountEditor(accounts, fixedCosts, onUpdate)
    const fixedCostEditor = useFixedCostEditor(fixedCosts, onUpdate)

    const [currentTheme, setCurrentTheme] = useState('rose')

    useEffect(() => {
        // Load initial theme
        loadTheme()
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentTheme(getSavedTheme())
    }, [])

    const handleThemeChange = (theme: string) => {
        setCurrentTheme(theme)
        applyTheme(theme)
    }

    // Calculated Budget
    const budget = useMemo(() => {
        const now = new Date()
        return incomeSources.filter(src => {
            const from = src.valid_from ? new Date(src.valid_from) : null
            const to = src.valid_to ? new Date(src.valid_to) : null

            if (from && now < from) return false
            if (to && now > to) return false
            return true
        }).reduce((sum, src) => {
            // FIXED: Normalize income to monthly
            let monthlyAmount = Number(src.amount)
            if (src.frequency === 'yearly') monthlyAmount /= 12
            if (src.frequency === 'weekly') monthlyAmount *= 4.33
            if (src.frequency === 'daily') monthlyAmount *= 30.4
            return sum + monthlyAmount
        }, 0)
    }, [incomeSources])

    // Filtered Fixed Costs (Active)

    const activeFixedCosts = useMemo(() => {
        const now = new Date()
        now.setHours(0, 0, 0, 0) // Normalize today to start of day

        return fixedCosts.filter(fc => {
            const from = fc.valid_from ? new Date(fc.valid_from) : null
            const to = fc.valid_to ? new Date(fc.valid_to) : null

            // Check if valid_to is in the past (strictly before today)
            // If valid_to is 2024-12-31, and now is 2026-02-17, it should return false.
            if (to) {
                const toDate = new Date(to)
                toDate.setHours(23, 59, 59, 999) // End of that day
                if (toDate < now) return false
            }

            if (from && now < from) return false

            return true
        })
    }, [fixedCosts])

    const totalFixed = activeFixedCosts.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const available = Number(budget) - totalFixed

    // PDF-Bibliothek im Hintergrund laden, damit der Report-Knopf sofort reagiert
    useEffect(() => { preloadPdf().catch(() => {}) }, [])

    const handleDownloadFullReport = () => withPdf(pdf => downloadFullReport(pdf, { budget, fixedCosts, incomeSources, accounts, expenses, settings }))

    const handleRestoreBackup = (event: React.ChangeEvent<HTMLInputElement>) => restoreBackup(event, onUpdate)

    // --- RENDER HELPERS ---
    // --- RENDER HELPERS ---

    // --- IMPORT WIZARD ---
    if (showImportWizard) {
        return (
            <div className="fixed inset-0 z-[60] h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-bottom duration-300 flex justify-center">
                <div className="w-full h-full md:max-w-2xl">
                    <ImportWizard
                        onClose={() => setShowImportWizard(false)}
                        onImportSuccess={() => {
                            onUpdate?.()
                        }}
                    />
                </div>
            </div>
        )
    }

    if (showHelp) {
        return <HelpModal onClose={() => setShowHelp(false)} />
    }

    // --- ACCOUNTS SUB-VIEW ---
    if (showAccounts) {
        return <AccountsView editor={accountEditor} onBack={() => setShowAccounts(false)} accounts={accounts} fixedCosts={fixedCosts} />
    }

    // --- SPASSKONTO (GRUPPEN) SUB-VIEW ---
    if (showFunHub) {
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
                <FunAccountHub onBack={() => setShowFunHub(false)} onUpdate={onUpdate} />
            </div>
        )
    }

    // --- FIXED COSTS SUB-VIEW ---
    if (showFixedCosts) {
        return <FixedCostsView editor={fixedCostEditor} onBack={() => setShowFixedCosts(false)} fixedCosts={fixedCosts} totalFixed={totalFixed} />
    }

    // --- INCOME SUB-VIEW ---
    if (showIncome) {
        return <IncomeView editor={incomeEditor} onBack={() => setShowIncome(false)} incomeSources={incomeSources} budget={budget} />
    }


    // --- MAIN SETTINGS VIEW ---
    return (
        <div className="w-full flex flex-col">
            {/* Header (Tools) */}
            <div className="flex items-center justify-between shrink-0 bg-transparent sticky top-0 z-20 mb-10">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Einstellungen
                </h1>
                <div data-tour="settings-tools" className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setShowHelp(true)} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted" title="Hilfe & Logik">
                        <HelpCircle className="w-5 h-5" strokeWidth={1.75} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setShowImportWizard(true)} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted" title="Kontoauszug importieren">
                        <FileText className="w-5 h-5" strokeWidth={1.75} />
                    </Button>
                    <label className="cursor-pointer" title="Backup wiederherstellen">
                        <div className="press inline-flex items-center justify-center whitespace-nowrap rounded-full w-10 h-10 hover:bg-muted transition-colors duration-200">
                            <Upload className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
                        </div>
                        <input type="file" accept=".pdf" className="hidden" onChange={handleRestoreBackup} />
                    </label>
                    <Button variant="ghost" size="icon" onClick={handleDownloadFullReport} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted" title="PDF-Report & Backup laden">
                        <Download className="w-5 h-5" strokeWidth={1.75} />
                    </Button>
                </div>
            </div>

            <div className="flex flex-col w-full pb-32">

                {/* Summary (Typographic) */}
                <div className="flex flex-col pb-8 mb-8 border-b border-border">
                    <p className="eyebrow mb-3">Wochenbudget</p>
                    <div className="amount font-light text-5xl text-foreground mb-4">
                        €{(available / 4.33).toFixed(2)}
                    </div>
                    <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
                        <span>Verfügbar nach Fixkosten (Monat)</span>
                        <span className="amount text-foreground">€{available.toFixed(2)}</span>
                    </div>
                </div>

                {/* Finanzen — Ledger-Zeilen */}
                <div data-tour="settings-finance" className="flex flex-col mb-10">
                    <p className="eyebrow mb-2">Finanzen</p>

                    <button
                        onClick={() => setShowIncome(true)}
                        className="ledger-row w-full text-left group cursor-pointer"
                    >
                        <div className="flex flex-col">
                            <span className="text-base font-semibold text-foreground">Einnahmen</span>
                            <span className="text-xs text-muted-foreground mt-0.5">{incomeSources.length} Quellen</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="amount text-base text-[var(--chart-pos)]">+€{Number(budget).toFixed(2)}</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                        </div>
                    </button>

                    <button
                        onClick={() => setShowAccounts(true)}
                        className="ledger-row w-full text-left group cursor-pointer"
                    >
                        <div className="flex flex-col">
                            <span className="text-base font-semibold text-foreground">Konten</span>
                            <span className="text-xs text-muted-foreground mt-0.5">{accounts.length} aktiv</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                    </button>

                    <button
                        onClick={() => setShowFixedCosts(true)}
                        className="ledger-row w-full text-left group cursor-pointer"
                    >
                        <div className="flex flex-col">
                            <span className="text-base font-semibold text-foreground">Fixkosten</span>
                            <span className="text-xs text-muted-foreground mt-0.5">{fixedCosts.length} Posten</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="amount text-base text-[var(--chart-neg-heavy)]">−€{totalFixed.toFixed(2)}</span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                        </div>
                    </button>

                    <button
                        onClick={() => setShowFunHub(true)}
                        className="ledger-row w-full text-left group cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.75} />
                            <span className="text-base font-semibold text-foreground">Spaßkonto</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                    </button>
                </div>

                {/* Design */}
                <div className="flex flex-col mb-10">
                    <p className="eyebrow mb-4">Farbschema</p>
                    <div className="grid grid-cols-3 gap-2.5">
                        {THEMES.map(theme => {
                            const active = currentTheme === theme.key
                            return (
                                <button
                                    key={theme.key}
                                    onClick={() => handleThemeChange(theme.key)}
                                    aria-pressed={active}
                                    className={`press p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors duration-200 ${active ? 'border-primary bg-card' : 'border-border bg-transparent hover:bg-card'}`}
                                >
                                    <span
                                        className="w-7 h-7 rounded-full shrink-0 border border-black/10"
                                        style={{ backgroundColor: theme.swatch }}
                                    >
                                        {active && <span className="block w-full h-full rounded-full ring-2 ring-offset-2 ring-offset-card ring-primary" />}
                                    </span>
                                    <span className={`text-xs font-medium text-center leading-tight ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {theme.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <AccountLegalSection />

                {/* Logout Button */}
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={onLogout}
                        className="press flex items-center gap-2 text-muted-foreground hover:text-[var(--chart-neg-heavy)] transition-colors duration-200 font-medium text-sm py-2 px-4"
                    >
                        <LogOut className="w-4 h-4" strokeWidth={1.75} />
                        Abmelden
                    </button>
                </div>
            </div>
        </div>
    )
}
