'use client'


import { useState, useEffect, useMemo } from 'react'
import { applyTheme, loadTheme } from '@/utils/theme'
import { ArrowLeft, ChevronRight, Trash2, LogOut, Download, Upload, FileText, HelpCircle, ArrowDown, ShoppingBag, CheckCircle2, AlertCircle } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ImportWizard from '@/components/ImportWizard'
import HelpModal from '@/components/HelpModal'
// Set worker source for pdfjs
import { supabase } from '@/utils/supabase'
import { Expense, FixedCost, Settings, Account, IncomeSource } from '@/app/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import { saveEmailConnection, getEmailConnectionStatus, deleteEmailConnection, type ConnectionStatus } from '@/app/actions/emailConnection'


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

    // REWE / Gmail-Verbindung
    const [showReweConnect, setShowReweConnect] = useState(false)
    const [reweStatus, setReweStatus] = useState<ConnectionStatus | null>(null)
    const [reweEmail, setReweEmail] = useState('')
    const [reweAppPassword, setReweAppPassword] = useState('')
    const [reweBusy, setReweBusy] = useState(false)
    const [reweMessage, setReweMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
    const [reweScope, setReweScope] = useState<'today' | 'all' | 'date'>('today')
    const [reweSinceDate, setReweSinceDate] = useState('')

    // Income Sources State
    const [showIncome, setShowIncome] = useState(false)
    const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null)
    const [editIncomeTitle, setEditIncomeTitle] = useState('')
    const [editIncomeAmount, setEditIncomeAmount] = useState('')
    const [editIncomeValidFrom, setEditIncomeValidFrom] = useState('')
    const [editIncomeValidTo, setEditIncomeValidTo] = useState('')
    const [editIncomeFrequency, setEditIncomeFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')

    const [newIncomeTitle, setNewIncomeTitle] = useState('')
    const [newIncomeAmount, setNewIncomeAmount] = useState('')
    const [newIncomeValidFrom, setNewIncomeValidFrom] = useState('')
    const [newIncomeValidTo, setNewIncomeValidTo] = useState('')
    const [newIncomeFrequency, setNewIncomeFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')

    // Accounts State
    // Accounts State
    const [showAccounts, setShowAccounts] = useState(false)
    const [newAccountName, setNewAccountName] = useState('')
    const [newAccountAmount, setNewAccountAmount] = useState('') // Current Amount
    const [newAccountStartAmount, setNewAccountStartAmount] = useState('') // Initial Amount (for savings)
    const [newAccountTargetAmount, setNewAccountTargetAmount] = useState('') // Target Amount
    const [newAccountTargetDate, setNewAccountTargetDate] = useState('') // Target Date
    const [newAccountMonths, setNewAccountMonths] = useState('') // For distribution
    const [newAccountType, setNewAccountType] = useState<'distribution' | 'savings'>('distribution')
    const [newAccountValidFrom, setNewAccountValidFrom] = useState(new Date().toISOString().split('T')[0]) // Start Date for distribution

    const [currentTheme, setCurrentTheme] = useState('paper')

    useEffect(() => {
        // Load initial theme
        const saved = localStorage.getItem('theme') || 'paper'
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentTheme(saved)
        loadTheme()
    }, [])

    const handleThemeChange = (theme: string) => {
        setCurrentTheme(theme)
        applyTheme(theme)
    }

    // --- REWE / Gmail-Verbindung ---
    useEffect(() => {
        getEmailConnectionStatus()
            .then((s) => {
                setReweStatus(s)
                if (s.email_address) setReweEmail(s.email_address)
                if (s.connected) {
                    if (s.import_since) {
                        setReweScope('date')
                        setReweSinceDate(new Date(s.import_since).toISOString().split('T')[0])
                    } else {
                        setReweScope('all')
                    }
                }
            })
            .catch(() => { })
    }, [])

    // Ermittelt das Import-Startdatum aus der Auswahl (null = alle Bons).
    const computeReweImportSince = (): string | null => {
        if (reweScope === 'all') return null
        if (reweScope === 'date') return reweSinceDate ? new Date(reweSinceDate).toISOString() : null
        const t = new Date()
        t.setHours(0, 0, 0, 0)
        return t.toISOString()
    }

    const handleConnectRewe = async () => {
        setReweBusy(true)
        setReweMessage(null)
        const res = await saveEmailConnection({ email: reweEmail, appPassword: reweAppPassword, importSince: computeReweImportSince() })
        setReweBusy(false)
        if (res.success) {
            setReweMessage({ type: 'success', text: 'Postfach erfolgreich verbunden!' })
            setReweAppPassword('')
            try { setReweStatus(await getEmailConnectionStatus()) } catch { }
        } else {
            setReweMessage({ type: 'error', text: res.error || 'Verbindung fehlgeschlagen.' })
        }
    }

    const handleDisconnectRewe = async () => {
        if (!confirm('Verbindung zum Postfach wirklich trennen? Bereits importierte Ausgaben bleiben erhalten.')) return
        setReweBusy(true)
        await deleteEmailConnection()
        setReweBusy(false)
        setReweStatus({ connected: false })
        setReweAppPassword('')
        setReweMessage(null)
    }

    // Derived Weekly Rate for Savings (Display Only during creation)
    const calculatedWeeklyRate = useMemo(() => {
        if (newAccountType !== 'savings' || !newAccountTargetAmount || !newAccountTargetDate || !newAccountAmount) return null

        const target = Number(newAccountTargetAmount)
        const targetDate = new Date(newAccountTargetDate)
        const now = new Date()

        if (targetDate <= now) return 0

        // FIXED: STRICTLY STATIC CALCULATION
        // Formula: (Target - StartAmount) / TotalMonths
        // We assume StartAmount = 0 for new accounts unless specified (user didn't ask for start amount input).
        // If user wants 12000 in 24 months, it MUST be 500.

        const startDate = newAccountValidFrom ? new Date(newAccountValidFrom) : new Date()

        // Calculate weeks between Start and Target
        const diffTime = Math.abs(targetDate.getTime() - startDate.getTime())
        const totalWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7))

        if (totalWeeks <= 0) return 0

        // Calculation: Target / Weeks
        return target / totalWeeks
    }, [newAccountType, newAccountTargetAmount, newAccountTargetDate, newAccountValidFrom, newAccountAmount])


    const [newCostTitle, setNewCostTitle] = useState('')
    const [newCostAmount, setNewCostAmount] = useState('')
    const [newCostValidFrom, setNewCostValidFrom] = useState('')
    const [newCostValidTo, setNewCostValidTo] = useState('')
    // const [newCostAccountId, setNewCostAccountId] = useState<number | null>(null) // REMOVED

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

    const handleAddIncome = async () => {
        if (!newIncomeTitle || !newIncomeAmount) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        const { error } = await supabase.from('income_sources').insert([{
            title: newIncomeTitle,
            amount: Number(newIncomeAmount),
            valid_from: newIncomeValidFrom ? new Date(newIncomeValidFrom).toISOString() : new Date().toISOString(),
            valid_to: newIncomeValidTo ? new Date(newIncomeValidTo).toISOString() : null,
            frequency: newIncomeFrequency,
            user_id: user.id
        }])
        if (error) console.error(error)
        else onUpdate?.()
        setNewIncomeTitle('')
        setNewIncomeAmount('')
        setNewIncomeValidFrom('')
        setNewIncomeValidTo('')
        setNewIncomeFrequency('monthly')
    }

    const handleStartEditIncome = (src: IncomeSource) => {
        setEditingIncomeId(src.id)
        setEditIncomeTitle(src.title)
        setEditIncomeAmount(src.amount.toString())
        setEditIncomeValidFrom(src.valid_from ? new Date(src.valid_from).toISOString().split('T')[0] : '')
        setEditIncomeValidTo(src.valid_to ? new Date(src.valid_to).toISOString().split('T')[0] : '')
        setEditIncomeFrequency(src.frequency || 'monthly')
    }

    const handleSaveEditIncome = async () => {
        if (!editingIncomeId || !editIncomeTitle || !editIncomeAmount) return

        const { error } = await supabase.from('income_sources').update({
            title: editIncomeTitle,
            amount: Number(editIncomeAmount),
            valid_from: editIncomeValidFrom ? new Date(editIncomeValidFrom).toISOString() : new Date().toISOString(),
            valid_to: editIncomeValidTo ? new Date(editIncomeValidTo).toISOString() : null,
            frequency: editIncomeFrequency
        }).eq('id', editingIncomeId)

        if (error) console.error(error)
        else onUpdate?.()

        setEditingIncomeId(null)
    }

    const handleQuickEndDate = async (id: number, date: string) => {
        if (!date) return
        const { error } = await supabase.from('income_sources').update({
            valid_to: new Date(date).toISOString()
        }).eq('id', id)

        if (error) console.error(error)
        else onUpdate?.()
    }

    const handleDeleteIncome = async (id: number) => {
        const { error } = await supabase.from('income_sources').delete().eq('id', id)
        if (error) console.error(error)
        else onUpdate?.()
    }


    const handleAddCost = async () => {
        if (!newCostTitle || !newCostAmount) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        const { error } = await supabase.from('fixed_costs').insert([{
            title: newCostTitle,
            amount: Number(newCostAmount),
            valid_from: newCostValidFrom ? new Date(newCostValidFrom).toISOString() : new Date().toISOString(),
            valid_to: newCostValidTo ? new Date(newCostValidTo).toISOString() : null,
            // account_id: newCostAccountId, // REMOVED
            user_id: user.id
        }])
        if (error) {
            console.error(error)
            alert('Fehler beim Speichern: ' + error.message)
        }
        else onUpdate?.()
        setNewCostTitle('')
        setNewCostAmount('')
        setNewCostValidFrom('')
        setNewCostValidTo('')
        // setNewCostAccountId(null)
    }

    const [editingCostId, setEditingCostId] = useState<number | null>(null)
    const [editCostTitle, setEditCostTitle] = useState('')
    const [editCostAmount, setEditCostAmount] = useState('')
    const [editCostValidFrom, setEditCostValidFrom] = useState('')
    const [editCostValidTo, setEditCostValidTo] = useState('')

    const handleStartEditCost = (cost: FixedCost) => {
        setEditingCostId(cost.id)
        setEditCostTitle(cost.title)
        setEditCostAmount(cost.amount.toString())
        setEditCostValidFrom(cost.valid_from ? new Date(cost.valid_from).toISOString().split('T')[0] : '')
        setEditCostValidTo(cost.valid_to ? new Date(cost.valid_to).toISOString().split('T')[0] : '')
    }

    const handleSaveEditCost = async () => {
        if (!editingCostId || !editCostTitle || !editCostAmount) return

        const { error } = await supabase.from('fixed_costs').update({
            title: editCostTitle,
            amount: Number(editCostAmount),
            valid_from: editCostValidFrom ? new Date(editCostValidFrom).toISOString() : new Date().toISOString(),
            valid_to: editCostValidTo ? new Date(editCostValidTo).toISOString() : null,
        }).eq('id', editingCostId)

        if (error) {
            console.error(error)
            alert('Fehler beim Speichern')
        } else {
            onUpdate?.()
            setEditingCostId(null)
        }
    }

    const handleDeleteCost = async (id: number) => {
        // Check if it's a linked cost (from Savings)
        const cost = fixedCosts.find(c => c.id === id)
        if (cost?.linked_account_id) {
            if (!confirm('Dieser Fixkosten-Eintrag ist mit einem Sparkonto verknüpft. Möchtest du ihn wirklich löschen? Dies stoppt die automatische Sparrate (das Konto bleibt erhalten).')) {
                return
            }
            // Optional: Remove link from account? Or just let it be.
        }

        const { error } = await supabase.from('fixed_costs').delete().eq('id', id)
        if (error) console.error(error)
        else onUpdate?.()
    }

    const handleAddAccount = async () => {
        if (!newAccountName || !newAccountAmount) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        let months = 0
        let accountData: any = {
            name: newAccountName,
            amount: Number(newAccountAmount),
            type: newAccountType,
            valid_from: newAccountValidFrom ? new Date(newAccountValidFrom).toISOString() : null,
            user_id: user.id
        }

        if (newAccountType === 'distribution') {
            months = Number(newAccountMonths)
            accountData.months = months
        } else {
            // Savings Logic
            // accountData.start_amount = newAccountStartAmount ? Number(newAccountStartAmount) : Number(newAccountAmount) // REMOVED
            accountData.target_amount = newAccountTargetAmount ? Number(newAccountTargetAmount) : null
            accountData.target_date = newAccountTargetDate ? new Date(newAccountTargetDate).toISOString() : null
            accountData.months = 0 // Irrelevant for savings
        }

        // 1. Create Account
        const { data: newAccount, error } = await supabase.from('accounts').insert([accountData]).select().single()

        if (error) {
            console.error(error)
            return
        }

        if (newAccountType === 'savings' && calculatedWeeklyRate && calculatedWeeklyRate > 0) {
            const { error: fcError } = await supabase.from('fixed_costs').insert([{
                title: `Sparziel: ${newAccountName}`,
                amount: calculatedWeeklyRate * 4.33,
                valid_from: newAccountValidFrom ? new Date(newAccountValidFrom).toISOString() : new Date().toISOString(),
                valid_to: newAccountTargetDate ? new Date(newAccountTargetDate).toISOString() : null,
                linked_account_id: newAccount.id,
                user_id: user.id
            }])
            if (fcError) console.error('Error creating linked fixed cost:', fcError)
        }

        onUpdate?.()
        setNewAccountName('')
        setNewAccountAmount('')
        setNewAccountMonths('')
        setNewAccountTargetAmount('')
        setNewAccountTargetDate('')
        setNewAccountStartAmount('')
        setNewAccountValidFrom(new Date().toISOString().split('T')[0])
    }

    const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
    const [editAccountName, setEditAccountName] = useState('')
    const [editAccountAmount, setEditAccountAmount] = useState('')
    const [editAccountTargetAmount, setEditAccountTargetAmount] = useState('')
    const [editAccountTargetDate, setEditAccountTargetDate] = useState('')
    const [editAccountMonths, setEditAccountMonths] = useState('')
    const [editAccountValidFrom, setEditAccountValidFrom] = useState('')

    const handleStartEditAccount = (acc: Account) => {
        setEditingAccountId(acc.id)
        setEditAccountName(acc.name)
        setEditAccountAmount(acc.amount.toString())
        setEditAccountTargetAmount(acc.target_amount ? acc.target_amount.toString() : '')
        setEditAccountTargetDate(acc.target_date ? new Date(acc.target_date).toISOString().split('T')[0] : '')
        setEditAccountMonths(acc.months ? acc.months.toString() : '')
        setEditAccountValidFrom(acc.valid_from ? new Date(acc.valid_from).toISOString().split('T')[0] : '')
    }

    const handleSaveEditAccount = async () => {
        if (!editingAccountId || !editAccountName || !editAccountAmount) return

        const currentAccount = accounts.find(a => a.id === editingAccountId)
        if (!currentAccount) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        let updates: any = {
            name: editAccountName,
            amount: Number(editAccountAmount),
            valid_from: editAccountValidFrom ? new Date(editAccountValidFrom).toISOString() : null
        }

        if (currentAccount.type === 'distribution') {
            updates.months = Number(editAccountMonths)
        } else {
            updates.target_amount = editAccountTargetAmount ? Number(editAccountTargetAmount) : null
            updates.target_date = editAccountTargetDate ? new Date(editAccountTargetDate).toISOString() : null
        }

        // 1. Update Account
        const { error } = await supabase.from('accounts').update(updates).eq('id', editingAccountId)
        if (error) {
            console.error(error)
            alert('Fehler beim Speichern')
            return
        }

        // 2. Sync Linked Fixed Cost (if Savings)
        if (currentAccount.type === 'savings') {
            const target = updates.target_amount
            const date = updates.target_date
            const current = updates.amount

            // Calculate new rate
            let newRate = 0
            if (target && date) {
                const targetDate = new Date(date)
                const now = new Date()
                if (targetDate > now) {
                    // FIXED: Use Total Duration (valid_from to target_date)
                    const startDate = updates.valid_from ? new Date(updates.valid_from) : (currentAccount.valid_from ? new Date(currentAccount.valid_from) : new Date())
                    const totalDiffTime = Math.abs(targetDate.getTime() - startDate.getTime())
                    const totalWeeks = Math.ceil(totalDiffTime / (1000 * 60 * 60 * 24 * 7))

                    // Logic: (Target - StartAmount) / TotalWeeks
                    // Since we don't strictly track StartAmount in historical data, we use:
                    // (Target) / TotalWeeks -> This assumes 0 start. 
                    // OR if we assume the current Amount was the start amount? No, that changes.
                    // We will stick to the User Request: (Zielbetrag - Startbetrag) / Gesamtlaufzeit. 
                    // As we lack Startbetrag, and "current" might be low (bad saver), using Target/TotalWeeks is the safest "Static Plan".
                    // If user wants to account for existing funds, they should lower the Target Amount.

                    if (totalWeeks > 0) {
                        // FIXED: STRICT FORMULA request by user
                        // (Target - Start) / TotalWeeks
                        // We do NOT use current account amount because that includes savings made.
                        // We assume start amount is 0 if not tracked.
                        newRate = target / totalWeeks
                    }
                }
            }

            // Update or Delete existing linked cost
            if (newRate > 0) {
                // Check if exists
                const existing = fixedCosts.find(fc => fc.linked_account_id === editingAccountId)
                const costData = {
                    title: `Sparziel: ${editAccountName}`,
                    amount: newRate * 4.33,
                    valid_to: date,
                    linked_account_id: editingAccountId,
                    user_id: user.id
                }

                if (existing) {
                    const { error } = await supabase.from('fixed_costs').update(costData).eq('id', existing.id)
                    if (error) console.error('Error updating linked cost', error)
                } else {
                    const { error } = await supabase.from('fixed_costs').insert([{ ...costData, valid_from: updates.valid_from || new Date().toISOString() }])
                    if (error) console.error('Error creating linked cost', error)
                }
            } else {
                // If no rate/target anymore, remove linked cost
                const { error } = await supabase.from('fixed_costs').delete().eq('linked_account_id', editingAccountId)
                if (error) console.error('Error removing linked cost', error)
            }
        }

        onUpdate?.()
        setEditingAccountId(null)
    }

    const handleDeleteAccount = async (id: number) => {
        if (!confirm('Möchtest du dieses Konto wirklich löschen?')) return

        const { error } = await supabase
            .from('accounts')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting account:', error)
        } else {
            // Also delete linked fixed costs
            const { error: fcError } = await supabase.from('fixed_costs').delete().eq('linked_account_id', id)
            if (fcError) console.error('Error deleting linked fixed cost', fcError)

            onUpdate?.()
        }
    }

    const handleTransferFromSavings = async (acc: Account) => {
        const amountStr = prompt(`Geld von "${acc.name}" zum Budget hinzufügen? Betrag eingeben:`)
        if (!amountStr) return
        const amount = parseFloat(amountStr)
        if (isNaN(amount) || amount <= 0) return

        if (acc.amount < amount) {
            alert('Nicht genügend Guthaben!')
            return
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        // 1. Deduct from Account
        const { error: accError } = await supabase
            .from('accounts')
            .update({ amount: acc.amount - amount })
            .eq('id', acc.id)

        if (accError) {
            console.error('Error updating account:', accError)
            return
        }

        // 2. Add "Negative Expense" (Income)
        const { error: expError } = await supabase
            .from('expenses')
            .insert([{
                description: `Transfer von ${acc.name}`,
                amount: -amount,
                expense_date: new Date().toISOString(),
                category: 'Sparen',
                user_id: user.id
            }])

        if (expError) console.error('Error adding transfer expense:', expError)

        onUpdate?.()
        onUpdate?.()
    }


    const handleDownloadFullReport = () => {
        const doc = new jsPDF()
        // FIXED: Filter out expired costs for PDF
        const activeFixedCostsForPdf = fixedCosts.filter(fc => {
            const now = new Date()
            now.setHours(0, 0, 0, 0)
            const to = fc.valid_to ? new Date(fc.valid_to) : null
            if (to) {
                const toDate = new Date(to)
                toDate.setHours(23, 59, 59, 999)
                if (toDate < now) return false
            }
            return true
        })

        const totalFixed = activeFixedCostsForPdf.reduce((acc, curr) => acc + Number(curr.amount), 0)
        const available = Number(budget) - totalFixed

        // Header
        doc.setFontSize(22)
        doc.setTextColor(33, 33, 33)
        doc.text('Finanzübersicht', 14, 22)

        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 14, 28)

        // Summary Section
        doc.setFontSize(14)
        doc.setTextColor(33, 33, 33)
        doc.text('Zusammenfassung', 14, 40)

        const summaryData = [
            ['Monatsbudget (Einnahmen)', `€${Number(budget).toFixed(2)}`],
            ['Fixkosten Gesamt', `€${totalFixed.toFixed(2)}`],
            ['Verfügbar (Monat)', `€${available.toFixed(2)}`],
            ['Verfügbar (Woche)', `€${(available / 4.33).toFixed(2)}`]
        ]

        autoTable(doc, {
            startY: 45,
            head: [],
            body: summaryData,
            theme: 'plain',
            styles: { fontSize: 11, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { cellWidth: 50 } },
        })

        // Income Sources Section
        let currentY = (doc as any).lastAutoTable.finalY + 15
        doc.setFontSize(14)
        doc.text('Einnahmequellen', 14, currentY)

        const incomeData = incomeSources.map(src => [
            src.title,
            `€${Number(src.amount).toFixed(2)}`,
            src.frequency || 'monthly',
            src.valid_from ? new Date(src.valid_from).toLocaleDateString('de-DE') : '-',
            src.valid_to ? new Date(src.valid_to).toLocaleDateString('de-DE') : '-'
        ])

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Quelle', 'Betrag', 'Intervall', 'Von', 'Bis']],
            body: incomeData.length ? incomeData : [['Keine Einnahmequellen', '-', '-', '-', '-']],
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }, // Green
        })

        // Account Overview Section
        currentY = (doc as any).lastAutoTable.finalY + 15
        doc.setFontSize(14)
        doc.text('Konten Übersicht', 14, currentY)

        const accountsData = accounts.map(acc => [
            acc.name,
            acc.type === 'savings' ? 'Sparkonto' : 'Aufteilung',
            `€${acc.amount.toFixed(2)}`,
            acc.type === 'distribution' ? acc.months.toString() : '-',
            acc.valid_from ? new Date(acc.valid_from).toLocaleDateString('de-DE') : '-'
        ])

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Name', 'Typ', 'Betrag', 'Monate', 'Startdatum']],
            body: accountsData.length ? accountsData : [['Keine Konten vorhanden', '-', '-', '-', '-']],
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] }, // Blue
        })

        // Fixed Costs Section
        currentY = (doc as any).lastAutoTable.finalY + 15

        // Check if we need a new page
        if (currentY > 250) {
            doc.addPage()
            currentY = 20
        }

        doc.setFontSize(14)
        doc.text('Fixkosten Details', 14, currentY)

        const fixedCostsData = activeFixedCostsForPdf.map(cost => [
            cost.title,
            `€${cost.amount.toFixed(2)}`
        ])

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Titel', 'Betrag']],
            body: fixedCostsData.length ? fixedCostsData : [['Keine Fixkosten', '-']],
            theme: 'grid',
            headStyles: { fillColor: [219, 39, 119] }, // Pink
        })

        // Expenses Section
        currentY = (doc as any).lastAutoTable.finalY + 15
        if (currentY > 250) {
            doc.addPage()
            currentY = 20
        }

        doc.setFontSize(14)
        doc.text('Ausgaben Übersicht', 14, currentY)

        // Sort expenses by date desc
        const sortedExpenses = [...expenses].sort((a, b) => new Date(b.expense_date || b.created_at).getTime() - new Date(a.expense_date || a.created_at).getTime())

        const expensesData = sortedExpenses.map(e => [
            new Date(e.expense_date || e.created_at).toLocaleDateString('de-DE'),
            e.description || e.category || '',
            e.category || '-',
            `€${e.amount.toFixed(2)}`
        ])

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Datum', 'Beschreibung', 'Kategorie', 'Betrag']],
            body: expensesData.length ? expensesData : [['Keine Ausgaben', '-', '-', '-']],
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] }, // Green
            styles: { fontSize: 9 }
        })

        // --- EMBED BACKUP DATA ---
        // Export complete objects including legacy fields and relationships
        const backupData = {
            settings: settings,
            accounts: accounts,
            fixedCosts: fixedCosts,
            expenses: expenses,
            incomeSources: incomeSources,
            timestamp: Date.now(),
            version: '1.1'
        }
        const backupString = `BACKUP_DATA_START:${JSON.stringify(backupData)}:BACKUP_DATA_END`

        doc.addPage()
        doc.setFontSize(8)
        doc.setTextColor(200, 200, 200)
        doc.text(backupString, 10, 10, { maxWidth: 190 })

        doc.save(`Finanzen_Report_${new Date().toISOString().split('T')[0]}.pdf`)
    }

    const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (e) => {
            const text = e.target?.result as string

            const startTag = 'BACKUP_DATA_START:'
            const endTag = ':BACKUP_DATA_END'

            const startIndex = text.indexOf(startTag)
            const endIndex = text.indexOf(endTag)

            if (startIndex === -1 || endIndex === -1) {
                alert('Keine gültigen Backup-Daten gefunden.')
                return
            }

            try {
                const jsonStr = text.substring(startIndex + startTag.length, endIndex)
                const data = JSON.parse(jsonStr)

                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                if (confirm('Achtung: Dies wird alle aktuellen Daten löschen und durch das Backup ersetzen. Fortfahren?')) {
                    // 1. Delete all existing
                    await supabase.from('expenses').delete().neq('id', 0)
                    await supabase.from('fixed_costs').delete().neq('id', 0)
                    await supabase.from('accounts').delete().neq('id', 0)
                    await supabase.from('income_sources').delete().neq('id', 0)

                    // 2. Restore Settings
                    // We only update setting fields, keeping ID/User static if possible, or fully update row
                    if (data.settings) {
                        const { id, user_id, ...settingsData } = data.settings
                        const { error } = await supabase.from('settings').update(settingsData).eq('user_id', user.id)
                        if (error) console.error('Error restoring settings:', error)
                    } else if (data.monthly_budget) {
                        // Legacy backup support
                        await supabase.from('settings').update({ monthly_budget: data.monthly_budget }).eq('user_id', user.id)
                    }

                    // 3. Restore Income Sources
                    if (data.incomeSources?.length) {
                        const incomeToInsert = data.incomeSources.map((inv: any) => {
                            const { id, user_id, created_at, ...rest } = inv
                            return { ...rest, user_id: user.id }
                        })
                        await supabase.from('income_sources').insert(incomeToInsert)
                    }

                    // 4. Restore Accounts (and map IDs)
                    const accountIdMap = new Map<number, number>()
                    if (data.accounts?.length) {
                        // We must insert sequentially to get IDs or loop
                        for (const acc of data.accounts) {
                            const oldId = acc.id
                            const { id, user_id, created_at, ...accData } = acc
                            const { data: newAcc, error } = await supabase.from('accounts').insert({ ...accData, user_id: user.id }).select().single()
                            if (newAcc && !error) {
                                if (oldId) accountIdMap.set(oldId, newAcc.id)
                            } else {
                                console.error('Error restoring account:', error)
                            }
                        }
                    }

                    // 5. Restore Fixed Costs (with updated linked_account_id)
                    if (data.fixedCosts?.length) {
                        const costsToInsert = data.fixedCosts.map((fc: any) => {
                            const { id, user_id, created_at, ...fcData } = fc
                            if (fcData.linked_account_id && accountIdMap.has(fcData.linked_account_id)) {
                                fcData.linked_account_id = accountIdMap.get(fcData.linked_account_id)
                            } else if (fcData.linked_account_id) {
                                fcData.linked_account_id = null // Unlink if account not found
                            }
                            // Legacy structure map?
                            if (!fcData.valid_from) fcData.valid_from = new Date().toISOString()
                            return { ...fcData, user_id: user.id }
                        })
                        await supabase.from('fixed_costs').insert(costsToInsert)
                    }

                    // 6. Restore Expenses (with updated account_id)
                    if (data.expenses?.length) {
                        const expensesToInsert = data.expenses.map((exp: any) => {
                            const { id, user_id, created_at, ...expData } = exp
                            if (expData.account_id && accountIdMap.has(expData.account_id)) {
                                expData.account_id = accountIdMap.get(expData.account_id)
                            } else {
                                expData.account_id = null
                            }
                            // Ensure date exists
                            if (!expData.expense_date && expData.created_at) expData.expense_date = expData.created_at
                            if (!expData.expense_date) expData.expense_date = new Date().toISOString()

                            return { ...expData, user_id: user.id }
                        })
                        // Bulk insert
                        const { error } = await supabase.from('expenses').insert(expensesToInsert)
                        if (error) console.error('Error restoring expenses:', error)
                    }

                    onUpdate?.()
                    alert('Backup erfolgreich wiederhergestellt!')
                }

            } catch (err) {
                console.error(err)
                alert('Fehler beim Lesen des Backups')
            }
        }
        reader.readAsText(file) // Try reading as text
    }

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
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => setShowAccounts(false)} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                                <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                            </Button>
                            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Konten</h1>
                        </div>
                    </div>

                    <div className="p-4 md:p-8 space-y-8 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                        {/* Add New Account */}
                        <Card className="rounded-2xl border-border bg-card shadow-none">
                            <CardHeader className="pb-4">
                                <CardTitle className="font-display text-lg font-semibold tracking-tight">Neues Konto anlegen</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {/* Type Selection */}
                                <div className="flex bg-muted/70 rounded-xl p-1 mb-4">
                                    <button
                                        onClick={() => setNewAccountType('distribution')}
                                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${newAccountType === 'distribution' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Aufteilung
                                    </button>
                                    <button
                                        onClick={() => setNewAccountType('savings')}
                                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${newAccountType === 'savings' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Sparkonto
                                    </button>
                                </div>

                                <FieldGroup className="space-y-4">
                                    <Field>
                                        <Input
                                            placeholder="Name des Kontos"
                                            value={newAccountName}
                                            onChange={(e) => setNewAccountName(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                    <div className="flex gap-2">
                                        <Field className="flex-1">
                                            <Input
                                                type="number"
                                                placeholder="Aktueller Betrag (€)"
                                                value={newAccountAmount}
                                                onChange={(e) => setNewAccountAmount(e.target.value)}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                            />
                                        </Field>
                                        {newAccountType === 'distribution' && (
                                            <Field className="flex-1">
                                                <Input
                                                    type="number"
                                                    placeholder="Monate"
                                                    value={newAccountMonths}
                                                    onChange={(e) => setNewAccountMonths(e.target.value)}
                                                    className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                                />
                                            </Field>
                                        )}
                                        <Field className="flex-1">
                                            <Input
                                                type="date"
                                                placeholder="Startdatum"
                                                value={newAccountValidFrom}
                                                onChange={(e) => setNewAccountValidFrom(e.target.value)}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                                title="Startdatum (Optional)"
                                            />
                                        </Field>
                                    </div>

                                    {newAccountType === 'savings' && (
                                        <div className="space-y-4 pt-2 border-t border-border/50 mt-2">
                                            <div className="flex gap-2">
                                                <Field className="flex-1">
                                                    <FieldLabel className="text-xs text-muted-foreground ml-2">Zielbetrag (€) (Optional)</FieldLabel>
                                                    <Input
                                                        type="number"
                                                        placeholder="Ziel (€)"
                                                        value={newAccountTargetAmount}
                                                        onChange={(e) => setNewAccountTargetAmount(e.target.value)}
                                                        className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                                    />
                                                </Field>
                                                <Field className="flex-1">
                                                    <FieldLabel className="text-xs text-muted-foreground ml-2">Zieldatum (Optional)</FieldLabel>
                                                    <Input
                                                        type="date"
                                                        value={newAccountTargetDate}
                                                        onChange={(e) => setNewAccountTargetDate(e.target.value)}
                                                        className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                                    />
                                                </Field>
                                            </div>

                                            {calculatedWeeklyRate !== null && calculatedWeeklyRate > 0 && (
                                                <div className="p-3 bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] rounded-xl text-sm font-semibold border border-transparent flex justify-between items-center">
                                                    <span>Wöchentliche Sparrate:</span>
                                                    <span className="amount">€{calculatedWeeklyRate.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleAddAccount}
                                        disabled={!newAccountName || !newAccountAmount || (newAccountType === 'distribution' && !newAccountMonths)}
                                        className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                    >
                                        Hinzufügen
                                    </Button>
                                </FieldGroup>
                            </CardContent>
                        </Card>

                        {/* Accounts List */}
                        <div className="space-y-4">
                            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Deine Konten</h3>
                            {accounts.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Noch keine Konten angelegt.</p>
                            ) : (
                                <div className="space-y-3">
                                    {accounts.map(acc => {
                                        const isEditing = editingAccountId === acc.id

                                        if (isEditing) {
                                            return (
                                                <Card key={acc.id} className="rounded-2xl border-2 border-primary/60 shadow-md bg-card">
                                                    <CardContent className="p-4 space-y-3">
                                                        <Input
                                                            value={editAccountName}
                                                            onChange={e => setEditAccountName(e.target.value)}
                                                            className="rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                            placeholder="Name"
                                                        />
                                                        <div className="flex gap-2">
                                                            <Input
                                                                type="number"
                                                                value={editAccountAmount}
                                                                onChange={e => setEditAccountAmount(e.target.value)}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                placeholder="Betrag"
                                                            />
                                                            {acc.type === 'distribution' && (
                                                                <>
                                                                    <Input
                                                                        type="number"
                                                                        value={editAccountMonths}
                                                                        onChange={e => setEditAccountMonths(e.target.value)}
                                                                        className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                        placeholder="Monate"
                                                                    />
                                                                    <Input
                                                                        type="date"
                                                                        value={editAccountValidFrom}
                                                                        onChange={e => setEditAccountValidFrom(e.target.value)}
                                                                        className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                                        title="Startdatum"
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                        {acc.type === 'savings' && (
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type="number"
                                                                    value={editAccountTargetAmount}
                                                                    onChange={e => setEditAccountTargetAmount(e.target.value)}
                                                                    className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                    placeholder="Ziel (€)"
                                                                />
                                                                <Input
                                                                    type="date"
                                                                    value={editAccountTargetDate}
                                                                    onChange={e => setEditAccountTargetDate(e.target.value)}
                                                                    className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <Button variant="ghost" size="sm" onClick={() => setEditingAccountId(null)} className="rounded-xl">Abbrechen</Button>
                                                            <Button size="sm" onClick={handleSaveEditAccount} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">Speichern</Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )
                                        }

                                        return (
                                            <div
                                                key={acc.id}
                                                className={`p-4 rounded-xl border border-border bg-card flex justify-between items-center group cursor-pointer hover:bg-muted/40 transition-colors duration-200`}
                                                onClick={() => {
                                                    if (acc.type === 'savings') {
                                                        handleTransferFromSavings(acc)
                                                    }
                                                }}
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-bold text-foreground text-lg">{acc.name}</p>
                                                        <Badge variant="secondary" className={`text-[10px] px-2 py-0 rounded-full font-bold uppercase ${acc.type === 'savings' ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : 'bg-muted text-muted-foreground'}`}>
                                                            {acc.type === 'savings' ? 'Sparkonto' : 'Aufteilung'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-medium mt-1">
                                                        <Badge variant="outline" className="bg-muted px-2 py-0.5 rounded-lg border-transparent">€{acc.amount.toFixed(2)}</Badge>
                                                        {acc.type === 'distribution' && (
                                                            <>
                                                                <Badge variant="outline" className="bg-muted px-2 py-0.5 rounded-lg border-transparent">{acc.months} Monate übrig</Badge>
                                                                {acc.valid_from && (
                                                                    <Badge variant="outline" className="bg-muted px-2 py-0.5 rounded-lg border-transparent">
                                                                        Start: {new Date(acc.valid_from).toLocaleDateString()}
                                                                    </Badge>
                                                                )}
                                                            </>
                                                        )}
                                                        {acc.type === 'savings' && acc.target_amount && (
                                                            <Badge variant="outline" className="bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] px-2 py-0.5 rounded-lg border-transparent">
                                                                Ziel: €{acc.target_amount} bis {acc.target_date ? new Date(acc.target_date).toLocaleDateString() : '?'}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {/* Progress Bar for Savings */}
                                                    {acc.type === 'savings' && acc.target_amount && (
                                                        <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-[var(--chart-pos)] rounded-full transition-[width] duration-500 ease-[var(--ease-out-strong)]"
                                                                style={{ width: `${Math.min(100, (acc.amount / Number(acc.target_amount)) * 100)}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" onClick={() => handleStartEditAccount(acc)} className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                                                        <FileText className="w-5 h-5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAccount(acc.id)} className="press text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted rounded-xl">
                                                        <Trash2 className="w-5 h-5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-muted/50 border border-border rounded-xl">
                            <p className="text-xs text-muted-foreground leading-relaxed text-center">
                                <b>Aufteilung:</b> Guthaben wird monatlich ausgezahlt.<br />
                                <b>Sparkonto:</b> Setze ein Sparziel. Eine automatische Fixkoste wird erstellt, um das Ziel zu erreichen.
                            </p>
                        </div>

                    </div>
                </div>
            </div>
        )
    }

    // --- FIXED COSTS SUB-VIEW ---
    if (showFixedCosts) {
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => setShowFixedCosts(false)} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                                <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                            </Button>
                            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Fixkosten</h1>
                        </div>
                    </div>

                    <div className="p-4 md:p-8 space-y-8 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                        {/* Add New Fixed Cost */}
                        <Card className="rounded-2xl border-border bg-card shadow-none">
                            <CardHeader className="pb-4">
                                <CardTitle className="font-display text-lg font-semibold tracking-tight">Neue Fixkosten hinzufügen</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <FieldGroup className="space-y-4">
                                    <div className="flex gap-2">
                                        <Field className="flex-[2]">
                                            <Input
                                                placeholder="Titel"
                                                value={newCostTitle}
                                                onChange={(e) => setNewCostTitle(e.target.value)}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                            />
                                        </Field>
                                        <Field className="flex-1">
                                            <Input
                                                type="number"
                                                placeholder="€ / Monat"
                                                value={newCostAmount}
                                                onChange={(e) => setNewCostAmount(e.target.value)}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                            />
                                        </Field>
                                    </div>
                                    {/* Date Range */}
                                    <div className="flex gap-2">
                                        <Field className="flex-1">
                                            <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig ab</FieldLabel>
                                            <DatePicker
                                                date={newCostValidFrom}
                                                setDate={setNewCostValidFrom}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                            />
                                        </Field>
                                        <Field className="flex-1">
                                            <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig bis (Optional)</FieldLabel>
                                            <DatePicker
                                                date={newCostValidTo}
                                                setDate={setNewCostValidTo}
                                                placeholder="Optional"
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                            />
                                        </Field>
                                    </div>

                                    <Button
                                        onClick={handleAddCost}
                                        disabled={!newCostTitle || !newCostAmount}
                                        className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                    >
                                        Hinzufügen
                                    </Button>
                                </FieldGroup>
                            </CardContent>
                        </Card>

                        {/* Fixed Costs List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Deine Fixkosten</h3>
                                <Badge variant="secondary" className="amount text-xs font-semibold text-foreground bg-muted px-3 py-1 rounded-full">
                                    Summe: €{totalFixed.toFixed(2)}
                                </Badge>
                            </div>

                            {fixedCosts.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Noch keine Fixkosten.</p>
                            ) : (
                                <div className="space-y-3">
                                    {fixedCosts.sort((a, b) => {
                                        const now = new Date()
                                        const aTo = a.valid_to ? new Date(a.valid_to) : null
                                        const bTo = b.valid_to ? new Date(b.valid_to) : null
                                        const aExpired = aTo && aTo < now
                                        const bExpired = bTo && bTo < now

                                        // 1. Active first, Expired last
                                        if (aExpired && !bExpired) return 1
                                        if (!aExpired && bExpired) return -1

                                        // 2. Sort by amount desc
                                        return b.amount - a.amount
                                    }).map(cost => {
                                        const now = new Date()
                                        const to = cost.valid_to ? new Date(cost.valid_to) : null
                                        const isExpired = to && to < now
                                        const isSavings = !!cost.linked_account_id
                                        const isEditing = editingCostId === cost.id

                                        if (isEditing) {
                                            return (
                                                <Card key={cost.id} className="rounded-2xl border-2 border-primary/60 shadow-md bg-card">
                                                    <CardContent className="p-4 space-y-3">
                                                        <div className="flex gap-2">
                                                            <Input
                                                                value={editCostTitle}
                                                                onChange={e => setEditCostTitle(e.target.value)}
                                                                className="flex-[2] rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                placeholder="Titel"
                                                            />
                                                            <Input
                                                                type="number"
                                                                value={editCostAmount}
                                                                onChange={e => setEditCostAmount(e.target.value)}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                placeholder="Betrag"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <FieldLabel className="text-[10px] text-muted-foreground ml-1">Von</FieldLabel>
                                                                <DatePicker
                                                                    date={editCostValidFrom}
                                                                    setDate={setEditCostValidFrom}
                                                                    className="rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <FieldLabel className="text-[10px] text-muted-foreground ml-1">Bis</FieldLabel>
                                                                <DatePicker
                                                                    date={editCostValidTo}
                                                                    setDate={setEditCostValidTo}
                                                                    placeholder="Optional"
                                                                    className="rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <Button variant="ghost" size="sm" onClick={() => setEditingCostId(null)} className="rounded-xl">Abbrechen</Button>
                                                            <Button size="sm" onClick={handleSaveEditCost} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">Speichern</Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )
                                        }

                                        return (
                                            <div key={cost.id} className={`flex items-center justify-between p-4 rounded-xl border group ${isExpired ? 'bg-muted/40 border-border opacity-60' : 'bg-card border-border'} transition-colors duration-200`}>
                                                <div className="min-w-0 flex-1 mr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className={`font-bold truncate text-lg ${isExpired ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{cost.title}</p>
                                                        {isSavings && (
                                                            <Badge variant="secondary" className="text-[10px] bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] px-2 py-0 rounded-full font-semibold">
                                                                SPAREN
                                                            </Badge>
                                                        )}
                                                        {isExpired && (
                                                            <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground px-2 py-0 rounded-full font-bold">
                                                                ABGELAUFEN
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className={`amount text-sm ${isExpired ? 'text-muted-foreground' : 'text-foreground'}`}>−€{cost.amount.toFixed(2)}</p>
                                                    <div className="text-[10px] text-muted-foreground mt-1">
                                                        {cost.valid_from && `Ab: ${new Date(cost.valid_from).toLocaleDateString()} `}
                                                        {cost.valid_to && `- Bis: ${new Date(cost.valid_to).toLocaleDateString()}`}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleStartEditCost(cost)} className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                                                        <FileText className="w-5 h-5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteCost(cost.id)} className="press text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted rounded-xl">
                                                        <Trash2 className="w-5 h-5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-muted/50 border border-border rounded-xl">
                            <p className="text-xs text-muted-foreground leading-relaxed text-center">
                                Diese Kosten werden automatisch von deinem monatlichen Budget abgezogen.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- INCOME SUB-VIEW ---
    if (showIncome) {
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => setShowIncome(false)} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                                <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                            </Button>
                            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Einnahmen</h1>
                        </div>
                    </div>

                    <div className="p-4 md:p-8 space-y-8 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                        {/* Add New Income */}
                        <Card className="rounded-2xl border-border bg-card shadow-none">
                            <CardHeader className="pb-4">
                                <CardTitle className="font-display text-lg font-semibold tracking-tight">Neue Einnahme hinzufügen</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <FieldGroup className="space-y-4">
                                    <Field>
                                        <Input
                                            placeholder="Quelle (z.B. Gehalt)"
                                            value={newIncomeTitle}
                                            onChange={(e) => setNewIncomeTitle(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                    <div className="flex gap-2">
                                        <Field className="flex-1">
                                            <Input
                                                type="number"
                                                placeholder="€ / Betrag"
                                                value={newIncomeAmount}
                                                onChange={(e) => setNewIncomeAmount(e.target.value)}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                            />
                                        </Field>
                                        <Field className="flex-1">
                                            <Select value={newIncomeFrequency} onValueChange={(val: any) => setNewIncomeFrequency(val)}>
                                                <SelectTrigger className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus:ring-primary w-full">
                                                    <SelectValue placeholder="Intervall" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-2xl">
                                                    <SelectItem value="monthly" className="rounded-xl">Monatlich</SelectItem>
                                                    <SelectItem value="yearly" className="rounded-xl">Jährlich</SelectItem>
                                                    <SelectItem value="weekly" className="rounded-xl">Wöchentlich</SelectItem>
                                                    <SelectItem value="daily" className="rounded-xl">Täglich</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    </div>
                                    <div className="flex gap-2">
                                        <Field className="flex-1">
                                            <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig ab</FieldLabel>
                                            <DatePicker
                                                date={newIncomeValidFrom}
                                                setDate={setNewIncomeValidFrom}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                            />
                                        </Field>
                                        <Field className="flex-1">
                                            <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig bis (Optional)</FieldLabel>
                                            <DatePicker
                                                date={newIncomeValidTo}
                                                setDate={setNewIncomeValidTo}
                                                placeholder="Optional"
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                            />
                                        </Field>
                                    </div>
                                    <Button
                                        onClick={handleAddIncome}
                                        disabled={!newIncomeTitle || !newIncomeAmount}
                                        className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                    >
                                        Hinzufügen
                                    </Button>
                                </FieldGroup>
                            </CardContent>
                        </Card>

                        {/* Income List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Deine Einnahmen</h3>
                                <Badge className="amount bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] hover:bg-[var(--chart-pos)]/10 px-3 py-1 rounded-full font-semibold">
                                    Summe: €{Number(budget).toFixed(2)}
                                </Badge>
                            </div>

                            {incomeSources.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Noch keine Einnahmen eingetragen.</p>
                            ) : (
                                <div className="space-y-3">
                                    {incomeSources.sort((a, b) => {
                                        if (!a.valid_to && b.valid_to) return -1
                                        if (a.valid_to && !b.valid_to) return 1
                                        if (!a.valid_to && !b.valid_to) return 0
                                        return new Date(b.valid_to!).getTime() - new Date(a.valid_to!).getTime()
                                    }).map(src => {
                                        const now = new Date()
                                        const from = src.valid_from ? new Date(src.valid_from) : null
                                        const to = src.valid_to ? new Date(src.valid_to) : null
                                        const isActive = (!from || now >= from) && (!to || now <= to)
                                        const isEditing = editingIncomeId === src.id

                                        if (isEditing) {
                                            return (
                                                <Card key={src.id} className="rounded-2xl border-2 border-primary/60 shadow-md bg-card">
                                                    <CardContent className="p-4 space-y-3">
                                                        <div className="space-y-2">
                                                            <Input
                                                                value={editIncomeTitle}
                                                                onChange={e => setEditIncomeTitle(e.target.value)}
                                                                className="w-full rounded-xl bg-muted border-transparent focus-visible:ring-primary text-sm"
                                                                placeholder="Titel"
                                                            />
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type="number"
                                                                    value={editIncomeAmount}
                                                                    onChange={e => setEditIncomeAmount(e.target.value)}
                                                                    className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-sm"
                                                                    placeholder="Betrag"
                                                                />
                                                                <Select value={editIncomeFrequency} onValueChange={(val: any) => setEditIncomeFrequency(val)}>
                                                                    <SelectTrigger className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-sm">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="rounded-xl">
                                                                        <SelectItem value="monthly" className="rounded-lg text-sm">Monatlich</SelectItem>
                                                                        <SelectItem value="yearly" className="rounded-lg text-sm">Jährlich</SelectItem>
                                                                        <SelectItem value="weekly" className="rounded-lg text-sm">Wöchentlich</SelectItem>
                                                                        <SelectItem value="daily" className="rounded-lg text-sm">Täglich</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <DatePicker
                                                                date={editIncomeValidFrom}
                                                                setDate={setEditIncomeValidFrom}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                            />
                                                            <DatePicker
                                                                date={editIncomeValidTo}
                                                                setDate={setEditIncomeValidTo}
                                                                placeholder="Optional"
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                            />
                                                        </div>
                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <Button variant="ghost" size="sm" onClick={() => setEditingIncomeId(null)} className="rounded-xl">Abbrechen</Button>
                                                            <Button size="sm" onClick={handleSaveEditIncome} className="press rounded-lg bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground transition-colors duration-200">Speichern</Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )
                                        }

                                        return (
                                            <div key={src.id} className={`flex flex-col p-4 rounded-xl border group transition-colors duration-200 ${isActive ? 'bg-card border-border' : 'bg-muted/40 border-border opacity-70'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 flex-1 mr-4">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold text-foreground truncate text-lg">{src.title}</p>
                                                            {!isActive && <Badge variant="secondary" className="bg-muted text-muted-foreground px-2 py-0 rounded-full text-[10px]">Inaktiv</Badge>}
                                                            {!src.valid_to && <Badge variant="secondary" className="bg-muted text-muted-foreground border border-transparent px-2 py-0 rounded-full text-[10px]">Unbegrenzt</Badge>}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <p className="amount text-sm text-[var(--chart-pos)]">
                                                                +€{Number(src.amount).toFixed(2)}
                                                                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                                                    ({src.frequency === 'daily' ? 'Tgl.' : src.frequency === 'weekly' ? 'Wöch.' : src.frequency === 'yearly' ? 'Jährl.' : 'Mtl.'})
                                                                </span>
                                                            </p>
                                                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                                {src.valid_from ? new Date(src.valid_from).toLocaleDateString('de-DE') : 'Start'}
                                                                {' - '}
                                                                {src.valid_to ? new Date(src.valid_to).toLocaleDateString('de-DE') : 'Unbegrenzt'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {!src.valid_to && (
                                                            <div className="relative group/end">
                                                                <input
                                                                    type="date"
                                                                    className="absolute inset-0 opacity-0 cursor-pointer w-8"
                                                                    onChange={(e) => handleQuickEndDate(src.id, e.target.value)}
                                                                />
                                                                <Button variant="ghost" size="icon" className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl" title="Enddatum setzen">
                                                                    <ArrowDown className="w-5 h-5 rotate-[-90deg]" />
                                                                </Button>
                                                            </div>
                                                        )}

                                                        <Button variant="ghost" size="icon" onClick={() => handleStartEditIncome(src)} className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                                                            <FileText className="w-5 h-5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteIncome(src.id)} className="press text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted rounded-xl">
                                                            <Trash2 className="w-5 h-5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-muted/50 border border-border rounded-xl">
                            <p className="text-xs text-muted-foreground leading-relaxed text-center">
                                Diese Einnahmen bilden dein monatliches Grundbudget.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- REWE / GMAIL CONNECT SUB-VIEW ---
    if (showReweConnect) {
        const isConnected = reweStatus?.connected
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => setShowReweConnect(false)} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                                <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                            </Button>
                            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">REWE Import</h1>
                        </div>
                    </div>

                    <div className="p-4 md:p-8 space-y-6 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                        {/* Status */}
                        {isConnected && (
                            <Card className="rounded-2xl border-[var(--chart-pos)]/40 bg-[var(--chart-pos)]/5 shadow-none">
                                <CardContent className="p-4 flex items-start gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-[var(--chart-pos)] shrink-0 mt-0.5" strokeWidth={2} />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-foreground text-sm">Verbunden</p>
                                        <p className="text-xs text-muted-foreground truncate">{reweStatus?.email_address}</p>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            {reweStatus?.last_sync_at
                                                ? `Letzter Abruf: ${new Date(reweStatus.last_sync_at).toLocaleString('de-DE')}`
                                                : 'Noch kein Abruf erfolgt.'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Import ab: {reweStatus?.import_since ? new Date(reweStatus.import_since).toLocaleDateString('de-DE') : 'Alle Bons'}
                                        </p>
                                        {reweStatus?.status === 'error' && reweStatus?.last_error && (
                                            <p className="text-[11px] text-[var(--chart-neg-heavy)] mt-1">Fehler: {reweStatus.last_error}</p>
                                        )}
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={handleDisconnectRewe} disabled={reweBusy} className="press rounded-xl text-muted-foreground hover:text-[var(--chart-neg-heavy)] shrink-0">
                                        Trennen
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {/* Verbinden / Aktualisieren */}
                        <Card className="rounded-2xl border-border bg-card shadow-none">
                            <CardHeader className="pb-4">
                                <CardTitle className="font-display text-lg font-semibold tracking-tight">
                                    {isConnected ? 'Zugangsdaten aktualisieren' : 'Gmail-Postfach verbinden'}
                                </CardTitle>
                                <CardDescription className="text-xs leading-relaxed">
                                    Deine REWE-eBon-Mails werden automatisch als Ausgaben (Kategorie „Essen“) übernommen.
                                    Nötig sind deine Gmail-Adresse und ein <b>Google-App-Passwort</b> (nicht dein normales Passwort).
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <FieldGroup className="space-y-4">
                                    <Field>
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Gmail-Adresse</FieldLabel>
                                        <Input
                                            type="email"
                                            placeholder="deine.adresse@gmail.com"
                                            value={reweEmail}
                                            onChange={(e) => setReweEmail(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                    <Field>
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">App-Passwort (16 Zeichen)</FieldLabel>
                                        <Input
                                            type="password"
                                            placeholder="xxxx xxxx xxxx xxxx"
                                            value={reweAppPassword}
                                            onChange={(e) => setReweAppPassword(e.target.value)}
                                            autoComplete="off"
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>

                                    {/* Import-Zeitraum wählen */}
                                    <Field>
                                        <FieldLabel className="text-xs text-muted-foreground ml-2 mb-1 block">Welche Bons importieren?</FieldLabel>
                                        <div className="flex bg-muted/70 rounded-xl p-1 gap-1">
                                            {([
                                                { key: 'today', label: 'Ab heute' },
                                                { key: 'all', label: 'Alle' },
                                                { key: 'date', label: 'Ab Datum' },
                                            ] as const).map((opt) => (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    onClick={() => setReweScope(opt.key)}
                                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${reweScope === opt.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                        {reweScope === 'date' && (
                                            <div className="mt-3">
                                                <DatePicker
                                                    date={reweSinceDate}
                                                    setDate={setReweSinceDate}
                                                    placeholder="Startdatum wählen"
                                                    className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                                />
                                            </div>
                                        )}
                                        <p className="text-[11px] text-muted-foreground mt-2 ml-1">
                                            {reweScope === 'today'
                                                ? 'Nur Einkäufe ab heute werden übernommen.'
                                                : reweScope === 'all'
                                                    ? 'Alle vorhandenen REWE-Bons im Postfach werden übernommen.'
                                                    : 'Nur Bons ab dem gewählten Datum werden übernommen.'}
                                        </p>
                                    </Field>

                                    {reweMessage && (
                                        <div className={`flex items-start gap-2 text-sm rounded-xl p-3 ${reweMessage.type === 'success' ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg-heavy)]/10 text-[var(--chart-neg-heavy)]'}`}>
                                            {reweMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                            <span>{reweMessage.text}</span>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleConnectRewe}
                                        disabled={!reweEmail || !reweAppPassword || reweBusy || (reweScope === 'date' && !reweSinceDate)}
                                        className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                    >
                                        {reweBusy ? 'Prüfe Verbindung…' : isConnected ? 'Aktualisieren' : 'Verbinden'}
                                    </Button>
                                </FieldGroup>
                            </CardContent>
                        </Card>

                        {/* Anleitung */}
                        <div className="p-4 bg-muted/50 border border-border rounded-xl space-y-2">
                            <p className="text-xs font-semibold text-foreground">So richtest du es ein:</p>
                            <ol className="text-xs text-muted-foreground leading-relaxed list-decimal ml-4 space-y-1">
                                <li>In deinem Google-Konto die <b>2-Faktor-Authentifizierung</b> aktivieren.</li>
                                <li>Ein <b>App-Passwort</b> erstellen unter <span className="break-all">myaccount.google.com/apppasswords</span> und oben eintragen.</li>
                                <li>In der REWE-App den <b>digitalen Kassenbon (eBon) per E-Mail</b> aktivieren – sonst kommen keine Mails an.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- MAIN SETTINGS VIEW ---
    return (
        <div className="w-full flex flex-col">
            {/* Header (Tools) */}
            <div className="flex items-center justify-between shrink-0 bg-transparent sticky top-0 z-20 mb-10">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Einstellungen
                </h1>
                <div className="flex gap-1">
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
                <div className="flex flex-col mb-10">
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
                </div>

                {/* Automatik */}
                <div className="flex flex-col mb-10">
                    <p className="eyebrow mb-2">Automatik</p>

                    <button
                        onClick={() => setShowReweConnect(true)}
                        className="ledger-row w-full text-left group cursor-pointer"
                    >
                        <div className="flex items-center gap-3">
                            <ShoppingBag className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                            <div className="flex flex-col">
                                <span className="text-base font-semibold text-foreground">REWE Import</span>
                                <span className="text-xs text-muted-foreground mt-0.5">
                                    {reweStatus?.connected ? `Verbunden · ${reweStatus.email_address}` : 'Postfach verbinden'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {reweStatus?.connected && (
                                <span className={`w-2 h-2 rounded-full ${reweStatus.status === 'error' ? 'bg-[var(--chart-neg-heavy)]' : 'bg-[var(--chart-pos)]'}`} />
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={1.75} />
                        </div>
                    </button>
                </div>

                {/* Design */}
                <div className="flex flex-col mb-10">
                    <p className="eyebrow mb-4">Design</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleThemeChange('pink')}
                            className={`press p-4 rounded-xl border text-left flex items-center gap-3 transition-colors duration-200 ${currentTheme !== 'blue' ? 'border-primary/50 bg-card' : 'border-border bg-transparent hover:bg-card'}`}
                        >
                            <span className="w-4 h-4 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: '#C13D5D' }}></span>
                            <span className={`font-semibold text-sm ${currentTheme !== 'blue' ? 'text-foreground' : 'text-muted-foreground'}`}>Rosé</span>
                        </button>
                        <button
                            onClick={() => handleThemeChange('blue')}
                            className={`press p-4 rounded-xl border text-left flex items-center gap-3 transition-colors duration-200 ${currentTheme === 'blue' ? 'border-primary/50 bg-card' : 'border-border bg-transparent hover:bg-card'}`}
                        >
                            <span className="w-4 h-4 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: '#33618F' }}></span>
                            <span className={`font-semibold text-sm ${currentTheme === 'blue' ? 'text-foreground' : 'text-muted-foreground'}`}>Nordlicht</span>
                        </button>
                    </div>
                </div>

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
