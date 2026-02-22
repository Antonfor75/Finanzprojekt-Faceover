'use client'


import { useState, useEffect, useMemo } from 'react'
import { applyTheme, loadTheme } from '@/utils/theme'
import { ArrowLeft, Trash2, LogOut, Wallet, Download, Upload, FileText, HelpCircle, ArrowDown } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ImportWizard from '@/components/ImportWizard'
import HelpModal from '@/components/HelpModal'
// Set worker source for pdfjs
import { supabase } from '@/utils/supabase'
import { Expense, FixedCost, Settings, Account, IncomeSource } from '@/app/types'

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
        setCurrentTheme(saved)
        loadTheme()
    }, [])

    const handleThemeChange = (theme: string) => {
        setCurrentTheme(theme)
        applyTheme(theme)
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
    }, [newAccountType, newAccountTargetAmount, newAccountTargetDate, newAccountValidFrom])


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
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-right duration-300 flex justify-center">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-8 flex items-center justify-between border-b border-border/20 shrink-0 bg-transparent sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setShowAccounts(false)} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                                <ArrowLeft className="w-8 h-8" />
                            </button>
                            <h1 className="text-2xl font-bold text-foreground">Konten Verwalten</h1>
                        </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 pb-20">
                        {/* Add New Account */}
                        <div className="bg-muted/50 p-6 rounded-2xl border border-border/50 space-y-4">
                            <h3 className="font-bold text-foreground">Neues Konto anlegen</h3>

                            {/* Type Selection */}
                            <div className="flex bg-muted rounded-xl p-1">
                                <button
                                    onClick={() => setNewAccountType('distribution')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newAccountType === 'distribution' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                >
                                    Aufteilung
                                </button>
                                <button
                                    onClick={() => setNewAccountType('savings')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newAccountType === 'savings' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                >
                                    Sparkonto
                                </button>
                            </div>

                            <div className="space-y-3">
                                <input
                                    placeholder="Name des Kontos"
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                    className="w-full px-4 py-3 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none text-foreground"
                                />
                                <div className="flex gap-3">
                                    <input
                                        type="number"
                                        placeholder="Aktueller Betrag (€)"
                                        value={newAccountAmount}
                                        onChange={(e) => setNewAccountAmount(e.target.value)}
                                        className="w-full px-4 py-3 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none text-foreground"
                                    />
                                    {newAccountType === 'distribution' && (
                                        <input
                                            type="number"
                                            placeholder="Monate"
                                            value={newAccountMonths}
                                            onChange={(e) => setNewAccountMonths(e.target.value)}
                                            className="w-full px-4 py-3 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none text-foreground"
                                        />
                                    )}
                                    <div className="flex-1">
                                        <input
                                            type="date"
                                            placeholder="Startdatum"
                                            value={newAccountValidFrom}
                                            onChange={(e) => setNewAccountValidFrom(e.target.value)}
                                            className="w-full px-4 py-3 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none text-sm text-muted-foreground"
                                            title="Startdatum (Optional)"
                                        />
                                    </div>
                                </div>

                                {newAccountType === 'savings' && (
                                    <div className="space-y-3 pt-2 border-t border-border/50">
                                        <div className="flex gap-3">
                                            <div className="flex-1">
                                                <label className="text-xs text-muted-foreground ml-2">Zielbetrag (€) (Optional)</label>
                                                <input
                                                    type="number"
                                                    placeholder="Ziel (€)"
                                                    value={newAccountTargetAmount}
                                                    onChange={(e) => setNewAccountTargetAmount(e.target.value)}
                                                    className="w-full px-4 py-3 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none text-foreground"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs text-muted-foreground ml-2">Zieldatum (Optional)</label>
                                                <input
                                                    type="date"
                                                    value={newAccountTargetDate}
                                                    onChange={(e) => setNewAccountTargetDate(e.target.value)}
                                                    className="w-full px-4 py-3 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none text-foreground"
                                                />
                                            </div>
                                        </div>

                                        {calculatedWeeklyRate !== null && calculatedWeeklyRate > 0 && (
                                            <div className="p-3 bg-green-50 text-green-700 rounded-xl text-sm font-bold border border-green-100 flex justify-between items-center">
                                                <span>Wöchentliche Sparrate:</span>
                                                <span>€{calculatedWeeklyRate.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={handleAddAccount}
                                    disabled={!newAccountName || !newAccountAmount || (newAccountType === 'distribution' && !newAccountMonths)}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Hinzufügen
                                </button>
                            </div>
                        </div>

                        {/* Accounts List */}
                        <div className="space-y-4">
                            <h3 className="font-bold text-foreground">Deine Konten</h3>
                            {accounts.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Noch keine Konten angelegt.</p>
                            ) : (
                                <div className="space-y-3">
                                    {accounts.map(acc => {
                                        const isEditing = editingAccountId === acc.id

                                        if (isEditing) {
                                            return (
                                                <div key={acc.id} className="p-4 bg-card rounded-xl border-2 border-blue-500 shadow-lg space-y-3">
                                                    <div className="space-y-3">
                                                        <input
                                                            value={editAccountName}
                                                            onChange={e => setEditAccountName(e.target.value)}
                                                            className="w-full px-4 py-2 bg-muted rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none text-foreground"
                                                            placeholder="Name"
                                                        />
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="number"
                                                                value={editAccountAmount}
                                                                onChange={e => setEditAccountAmount(e.target.value)}
                                                                className="flex-1 px-4 py-2 bg-muted rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none text-foreground"
                                                                placeholder="Betrag"
                                                            />
                                                            {acc.type === 'distribution' && (
                                                                <>
                                                                    <input
                                                                        type="number"
                                                                        value={editAccountMonths}
                                                                        onChange={e => setEditAccountMonths(e.target.value)}
                                                                        className="flex-1 px-4 py-2 bg-muted rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none text-foreground"
                                                                        placeholder="Monate"
                                                                    />
                                                                    <input
                                                                        type="date"
                                                                        value={editAccountValidFrom}
                                                                        onChange={e => setEditAccountValidFrom(e.target.value)}
                                                                        className="flex-1 px-4 py-2 bg-muted rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none text-foreground"
                                                                        title="Startdatum"
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                        {acc.type === 'savings' && (
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="number"
                                                                    value={editAccountTargetAmount}
                                                                    onChange={e => setEditAccountTargetAmount(e.target.value)}
                                                                    className="flex-1 px-4 py-2 bg-muted rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none text-foreground"
                                                                    placeholder="Ziel (€)"
                                                                />
                                                                <input
                                                                    type="date"
                                                                    value={editAccountTargetDate}
                                                                    onChange={e => setEditAccountTargetDate(e.target.value)}
                                                                    className="flex-1 px-4 py-2 bg-muted rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none text-foreground"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <button onClick={() => setEditingAccountId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Abbrechen</button>
                                                            <button onClick={handleSaveEditAccount} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm">Speichern</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div
                                                key={acc.id}
                                                className={`p-4 rounded-xl shadow-sm border border-border/50 flex justify-between items-center group cursor-pointer hover:bg-muted/50 bg-card`}
                                                onClick={() => {
                                                    if (acc.type === 'savings') {
                                                        handleTransferFromSavings(acc)
                                                    }
                                                }}
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-foreground">{acc.name}</p>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${acc.type === 'savings' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {acc.type === 'savings' ? 'Sparkonto' : 'Aufteilung'}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2 text-xs text-muted-foreground font-medium mt-1">
                                                        <span className="bg-muted px-2 py-0.5 rounded">€{acc.amount.toFixed(2)}</span>
                                                        {acc.type === 'distribution' && (
                                                            <>
                                                                <span className="bg-muted px-2 py-0.5 rounded">{acc.months} Monate übrig</span>
                                                                {acc.valid_from && (
                                                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                                                        Start: {new Date(acc.valid_from).toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                        {acc.type === 'savings' && acc.target_amount && (
                                                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">
                                                                Ziel: €{acc.target_amount} bis {acc.target_date ? new Date(acc.target_date).toLocaleDateString() : '?'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Progress Bar for Savings */}
                                                    {acc.type === 'savings' && acc.target_amount && (
                                                        <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-green-500 rounded-full"
                                                                style={{ width: `${Math.min(100, (acc.amount / Number(acc.target_amount)) * 100)}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleStartEditAccount(acc)}
                                                        className="p-2 text-muted-foreground/50 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <FileText className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAccount(acc.id)}
                                                        className="p-2 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                            <p className="text-xs text-blue-700 leading-relaxed">
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
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-right duration-300 flex justify-center">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-8 flex items-center justify-between border-b border-border/20 shrink-0 bg-transparent sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setShowFixedCosts(false)} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                                <ArrowLeft className="w-8 h-8" />
                            </button>
                            <h1 className="text-2xl font-bold text-foreground">Fixkosten Verwalten</h1>
                        </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 pb-20">
                        {/* Add New Fixed Cost */}
                        <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20 space-y-4">
                            <h3 className="font-bold text-foreground">Neue Fixkosten hinzufügen</h3>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        placeholder="Titel"
                                        value={newCostTitle}
                                        onChange={(e) => setNewCostTitle(e.target.value)}
                                        className="flex-[2] min-w-0 h-14 px-4 text-base md:text-lg bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-primary/50 outline-none text-foreground"
                                    />
                                    <input
                                        type="number"
                                        placeholder="€ (Monatlich)"
                                        value={newCostAmount}
                                        onChange={(e) => setNewCostAmount(e.target.value)}
                                        className="flex-1 min-w-0 h-14 px-4 text-base md:text-lg bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-primary/50 outline-none text-foreground"
                                    />
                                </div>
                                {/* Date Range */}
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-xs text-muted-foreground ml-2">Gültig ab</label>
                                        <input
                                            type="date"
                                            value={newCostValidFrom}
                                            onChange={(e) => setNewCostValidFrom(e.target.value)}
                                            className="w-full h-12 px-4 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-primary/50 outline-none text-sm text-foreground"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-muted-foreground ml-2">Gültig bis (Optional)</label>
                                        <input
                                            type="date"
                                            value={newCostValidTo}
                                            onChange={(e) => setNewCostValidTo(e.target.value)}
                                            className="w-full h-12 px-4 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-primary/50 outline-none text-sm text-foreground"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleAddCost}
                                    disabled={!newCostTitle || !newCostAmount}
                                    className="w-full h-12 px-6 bg-primary text-primary-foreground hover:opacity-90 rounded-xl transition-colors shadow-md flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Hinzufügen
                                </button>
                            </div>
                        </div>

                        {/* Fixed Costs List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-foreground">Deine Fixkosten</h3>
                                <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
                                    Summe: €{totalFixed.toFixed(2)}
                                </span>
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
                                                <div key={cost.id} className="p-4 bg-card rounded-xl border-2 border-primary shadow-lg space-y-3">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={editCostTitle}
                                                            onChange={e => setEditCostTitle(e.target.value)}
                                                            className="flex-[2] px-3 py-2 bg-muted rounded-lg text-sm border focus:ring-2 focus:ring-primary/50 outline-none text-foreground"
                                                            placeholder="Titel"
                                                        />
                                                        <input
                                                            type="number"
                                                            value={editCostAmount}
                                                            onChange={e => setEditCostAmount(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm border focus:ring-2 focus:ring-primary/50 outline-none text-foreground"
                                                            placeholder="Betrag"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <label className="text-[10px] text-muted-foreground ml-1">Von</label>
                                                            <input
                                                                type="date"
                                                                value={editCostValidFrom}
                                                                onChange={e => setEditCostValidFrom(e.target.value)}
                                                                className="w-full px-3 py-2 bg-muted rounded-lg text-xs border focus:ring-2 focus:ring-primary/50 outline-none text-foreground"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <label className="text-[10px] text-muted-foreground ml-1">Bis</label>
                                                            <input
                                                                type="date"
                                                                value={editCostValidTo}
                                                                onChange={e => setEditCostValidTo(e.target.value)}
                                                                className="w-full px-3 py-2 bg-muted rounded-lg text-xs border focus:ring-2 focus:ring-primary/50 outline-none text-foreground"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <button onClick={() => setEditingCostId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Abbrechen</button>
                                                        <button onClick={handleSaveEditCost} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 font-bold shadow-sm">Speichern</button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div key={cost.id} className={`flex items-center justify-between p-4 bg-card rounded-xl border shadow-sm group ${isExpired ? 'bg-muted border-border opacity-60' : isSavings ? 'border-green-200 bg-green-50/30' : 'border-border'}`}>
                                                <div className="min-w-0 flex-1 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`font-bold truncate text-lg ${isExpired ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{cost.title}</p>
                                                        {isSavings && (
                                                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                                                SPAREN
                                                            </span>
                                                        )}
                                                        {isExpired && (
                                                            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                                                                ABGELAUFEN
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`text-sm font-bold ${isExpired ? 'text-muted-foreground' : 'text-primary'}`}>-€{cost.amount.toFixed(2)}</p>
                                                    <div className="text-[10px] text-muted-foreground mt-1">
                                                        {cost.valid_from && `Ab: ${new Date(cost.valid_from).toLocaleDateString()} `}
                                                        {cost.valid_to && `- Bis: ${new Date(cost.valid_to).toLocaleDateString()}`}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleStartEditCost(cost)}
                                                        className="p-2 text-muted-foreground/50 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <FileText className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCost(cost.id)}
                                                        className="p-2 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                            <p className="text-xs text-primary leading-relaxed">
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
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-right duration-300 flex justify-center">
                <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                    <div className="p-8 flex items-center justify-between border-b border-border/20 shrink-0 bg-transparent sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setShowIncome(false)} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                                <ArrowLeft className="w-8 h-8" />
                            </button>
                            <h1 className="text-2xl font-bold text-foreground">Einnahmen Verwalten</h1>
                        </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 pb-20">
                        {/* Add New Income */}
                        <div className="bg-green-50/50 p-6 rounded-2xl border border-green-100/50 space-y-4">
                            <h3 className="font-bold text-foreground">Neue Einnahme hinzufügen</h3>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        placeholder="Quelle (z.B. Gehalt)"
                                        value={newIncomeTitle}
                                        onChange={(e) => setNewIncomeTitle(e.target.value)}
                                        className="flex-[2] min-w-0 h-14 px-4 text-base md:text-lg bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-foreground"
                                    />
                                    <input
                                        type="number"
                                        placeholder="€"
                                        value={newIncomeAmount}
                                        onChange={(e) => setNewIncomeAmount(e.target.value)}
                                        className="flex-1 min-w-0 h-14 px-4 text-base md:text-lg bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-foreground"
                                    />
                                    <select
                                        value={newIncomeFrequency}
                                        onChange={(e: any) => setNewIncomeFrequency(e.target.value)}
                                        className="h-14 px-4 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-sm font-medium text-foreground"
                                    >
                                        <option value="monthly">Monatlich</option>
                                        <option value="yearly">Jährlich</option>
                                        <option value="weekly">Wöchentlich</option>
                                        <option value="daily">Täglich</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-xs text-muted-foreground ml-2">Gültig ab</label>
                                        <input
                                            type="date"
                                            value={newIncomeValidFrom}
                                            onChange={(e) => setNewIncomeValidFrom(e.target.value)}
                                            className="w-full h-12 px-4 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-sm text-foreground"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-muted-foreground ml-2">Gültig bis (Optional)</label>
                                        <input
                                            type="date"
                                            value={newIncomeValidTo}
                                            onChange={(e) => setNewIncomeValidTo(e.target.value)}
                                            className="w-full h-12 px-4 bg-card rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-sm text-foreground"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddIncome}
                                    disabled={!newIncomeTitle || !newIncomeAmount}
                                    className="w-full h-12 bg-green-600 text-white hover:opacity-90 rounded-xl transition-colors shadow-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                                >
                                    Hinzufügen
                                </button>
                            </div>
                        </div>

                        {/* Income List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-foreground">Deine Einnahmen</h3>
                                <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                                    Summe: €{Number(budget).toFixed(2)}
                                </span>
                            </div>

                            {incomeSources.length === 0 ? (
                                <p className="text-muted-foreground text-center py-8">Noch keine Einnahmen eingetragen.</p>
                            ) : (
                                <div className="space-y-3">
                                    {incomeSources.sort((a, b) => {
                                        // 1. Unlimited (no valid_to) first
                                        if (!a.valid_to && b.valid_to) return -1
                                        if (a.valid_to && !b.valid_to) return 1

                                        // 2. Both unlimited -> sort by creation (optional, stable sort) or title
                                        if (!a.valid_to && !b.valid_to) return 0

                                        // 3. Both limited -> sort by End Date DESCENDING (latest end date first)
                                        return new Date(b.valid_to!).getTime() - new Date(a.valid_to!).getTime()
                                    }).map(src => {
                                        const now = new Date()
                                        const from = src.valid_from ? new Date(src.valid_from) : null
                                        const to = src.valid_to ? new Date(src.valid_to) : null
                                        const isActive = (!from || now >= from) && (!to || now <= to)
                                        const isEditing = editingIncomeId === src.id

                                        if (isEditing) {
                                            return (
                                                <div key={src.id} className="p-4 bg-card rounded-xl border-2 border-green-500 shadow-lg space-y-3">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={editIncomeTitle}
                                                            onChange={e => setEditIncomeTitle(e.target.value)}
                                                            className="flex-[2] px-3 py-2 bg-muted rounded-lg text-sm border focus:ring-2 focus:ring-green-500/50 outline-none text-foreground"
                                                            placeholder="Titel"
                                                        />
                                                        <input
                                                            type="number"
                                                            value={editIncomeAmount}
                                                            onChange={e => setEditIncomeAmount(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm border focus:ring-2 focus:ring-green-500/50 outline-none text-foreground"
                                                            placeholder="Amount"
                                                        />
                                                        <select
                                                            value={editIncomeFrequency}
                                                            onChange={(e: any) => setEditIncomeFrequency(e.target.value)}
                                                            className="px-3 py-2 bg-muted rounded-lg text-sm border focus:ring-2 focus:ring-green-500/50 outline-none text-foreground"
                                                        >
                                                            <option value="monthly">Mtl.</option>
                                                            <option value="yearly">Jährl.</option>
                                                            <option value="weekly">Wöch.</option>
                                                            <option value="daily">Tägl.</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="date"
                                                            value={editIncomeValidFrom}
                                                            onChange={e => setEditIncomeValidFrom(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs border text-foreground"
                                                        />
                                                        <input
                                                            type="date"
                                                            value={editIncomeValidTo}
                                                            onChange={e => setEditIncomeValidTo(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs border text-foreground"
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <button onClick={() => setEditingIncomeId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Abbrechen</button>
                                                        <button onClick={handleSaveEditIncome} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-sm">Speichern</button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div key={src.id} className={`flex flex-col p-4 rounded-xl border shadow-sm group transition-all ${isActive ? 'bg-card border-border' : 'bg-muted border-border opacity-70'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 flex-1 mr-4">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-foreground truncate text-lg">{src.title}</p>
                                                            {!isActive && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">Inaktiv</span>}
                                                            {!src.valid_to && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold border border-blue-100">Unbegrenzt</span>}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <p className="text-sm text-green-600 font-bold">
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
                                                        {/* Quick End Date Button for Unlimited Sources */}
                                                        {!src.valid_to && (
                                                            <div className="relative group/end">
                                                                <input
                                                                    type="date"
                                                                    className="absolute inset-0 opacity-0 cursor-pointer w-8"
                                                                    onChange={(e) => handleQuickEndDate(src.id, e.target.value)}
                                                                />
                                                                <button className="p-2 text-blue-200 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Enddatum setzen">
                                                                    <ArrowDown className="w-5 h-5 rotate-[-90deg]" />
                                                                </button>
                                                            </div>
                                                        )}

                                                        <button
                                                            onClick={() => handleStartEditIncome(src)}
                                                            className="p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Bearbeiten"
                                                        >
                                                            <FileText className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteIncome(src.id)}
                                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Löschen"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                            <p className="text-xs text-green-700 leading-relaxed">
                                Diese Einnahmen bilden dein monatliches Grundbudget.
                            </p>
                        </div>

                    </div>
                </div>
            </div>
        )
    }


    // --- MAIN SETTINGS VIEW ---
    return (
        <div className={`fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right duration-300 flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none`} >
            <div className={`w-full min-h-full md:max-w-2xl flex flex-col md:border-x border-primary/10 transition-colors duration-300`}>
                {/* Header */}
                <div className="p-3 md:p-8 flex items-center justify-between border-b border-primary/10 shrink-0 bg-transparent sticky top-0 z-20 backdrop-blur-xl">
                    <div className="flex items-center gap-2 md:gap-4">
                        <button onClick={onBack} className="p-1 md:p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6 md:w-8 md:h-8" />
                        </button>
                        {/* Hide title on very small screens to make space for icons */}
                        <h1 className="text-lg md:text-3xl font-bold text-foreground hidden sm:block">Einstellungen</h1>
                    </div>
                    <div className="flex gap-1 md:gap-2">
                        <button
                            onClick={() => setShowHelp(true)}
                            className="p-1 md:p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors"
                            title="Hilfe & Logik"
                        >
                            <HelpCircle className="w-6 h-6 md:w-8 md:h-8" />
                        </button>
                        <button
                            onClick={() => setShowImportWizard(true)}
                            className="p-1 md:p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors"
                            title="Kontoauszug Importieren"
                        >
                            <FileText className="w-6 h-6 md:w-8 md:h-8" />
                        </button>
                        <label className="p-1 md:p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors cursor-pointer" title="Backup wiederherstellen">
                            <Upload className="w-6 h-6 md:w-8 md:h-8" />
                            <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={handleRestoreBackup}
                            />
                        </label>
                        <button
                            onClick={handleDownloadFullReport}
                            className="p-1 md:p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors"
                            title="PDF Report & Backup Laden"
                        >
                            <Download className="w-6 h-6 md:w-8 md:h-8" />
                        </button>
                    </div>
                </div>


                <div className="p-4 md:p-10 space-y-6 md:space-y-8 flex-1 pb-32">

                    {/* Monthly Budget Section */}
                    {/* Income Sources Section */}
                    <div className="bg-card shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg md:text-2xl font-bold text-foreground">Monatliche Einnahmen</h3>
                            <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                                Summe: €{Number(budget).toFixed(2)}
                            </span>
                        </div>

                        <button
                            onClick={() => setShowIncome(true)}
                            className="w-full h-16 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors flex items-center justify-between px-6 font-bold group"
                        >
                            <span className="flex items-center gap-3">
                                <Wallet className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                <span className="text-base md:text-lg">Einnahmen verwalten</span>
                            </span>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold">€{Number(budget).toFixed(2)}</span>
                                <span className="text-[10px] opacity-70">{incomeSources.length} Quellen</span>
                            </div>
                        </button>

                        {/* Konten Button */}
                        <button
                            onClick={() => setShowAccounts(true)}
                            className="w-full h-16 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-between px-6 font-bold group mt-4"
                        >
                            <span className="flex items-center gap-3">
                                <Wallet className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                <span className="text-base md:text-lg">Konten verwalten</span>
                            </span>
                            <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full">
                                {accounts.length} Aktiv
                            </span>
                        </button>
                    </div>

                    {/* Fixed Costs Section */}
                    <div className="bg-card shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg md:text-2xl font-bold text-foreground">Fixkosten</h3>
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                                Summe: €{totalFixed.toFixed(2)}
                            </span>
                        </div>

                        <button
                            onClick={() => setShowFixedCosts(true)}
                            className="w-full h-16 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-between px-6 font-bold group"
                        >
                            <span className="flex items-center gap-3">
                                <Wallet className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                <span className="text-base md:text-lg">Fixkosten verwalten</span>
                            </span>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold">€{totalFixed.toFixed(2)}</span>
                                <span className="text-sm opacity-70">{fixedCosts.length} Posten</span>
                            </div>
                        </button>
                    </div>




                    {/* Design Section */}
                    <div className="bg-card shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <h3 className="text-lg md:text-2xl font-bold text-foreground">Design</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleThemeChange('paper')}
                                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${currentTheme !== 'pink' ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                            >
                                <div className="w-8 h-8 rounded-full bg-[#f8f5e6] border border-border shadow-sm"></div>
                                <span className="font-bold">Standard</span>
                            </button>
                            <button
                                onClick={() => handleThemeChange('pink')}
                                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${currentTheme === 'pink' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                            >
                                <div className="w-8 h-8 rounded-full bg-[#fff1f2] border border-border shadow-sm"></div>
                                <span className="font-bold">Pink Premium</span>
                            </button>
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="p-6 bg-primary/5 border border-primary/10 rounded-2xl shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-muted-foreground font-medium">Verfügbar nach Fixkosten</span>
                            <span className="text-xl font-bold text-primary">€{available.toFixed(2)}</span>
                        </div>
                        <div className="h-px bg-primary/10 w-full my-2"></div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-sm text-primary/80 font-bold uppercase tracking-wide">Wöchentliches Budget</span>
                            <span className="text-2xl font-extrabold text-primary">€{(available / 4.33).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Logout Button */}
                    <button
                        onClick={onLogout}
                        className="w-full border-2 border-red-500 text-red-500 font-bold py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2 mb-8"
                    >
                        <LogOut className="w-6 h-6" />
                        Abmelden
                    </button>
                </div>
            </div>
        </div>

    )
}
