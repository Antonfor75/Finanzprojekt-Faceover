'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Plus, Trash2, Save, LogOut, Wallet, Download, Upload, ArrowDown, Moon, Sun, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ImportWizard from '@/components/ImportWizard'
// Set worker source for pdfjs
import { supabase } from '@/utils/supabase'
import { Expense, FixedCost, Settings, Account, IncomeSource } from '@/app/types'

type SettingsOverlayProps = {
    onBack: () => void
    settings: Settings
    fixedCosts: FixedCost[]
    accounts?: Account[]
    incomeSources: IncomeSource[]
    theme: string
    setTheme: (theme: string) => void
    onLogout: () => void
    onUpdate?: () => void
    expenses: Expense[]
    isDarkMode: boolean
    toggleDarkMode: () => void
}

export default function SettingsOverlay({ onBack, settings, fixedCosts, accounts = [], incomeSources = [], theme, setTheme, onLogout, onUpdate, expenses, isDarkMode, toggleDarkMode }: SettingsOverlayProps) {
    // const [budget, setBudget] = useState<string | number>(settings?.monthly_budget || 0) // REMOVED: Calculated dynamically now
    const [showImportWizard, setShowImportWizard] = useState(false)
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

    // Derived Weekly Rate for Savings (Display Only during creation)
    const calculatedWeeklyRate = useMemo(() => {
        if (newAccountType !== 'savings' || !newAccountTargetAmount || !newAccountTargetDate || !newAccountAmount) return null

        const target = Number(newAccountTargetAmount)
        const current = Number(newAccountAmount)
        const targetDate = new Date(newAccountTargetDate)
        const now = new Date()

        if (targetDate <= now) return 0

        const diffTime = Math.abs(targetDate.getTime() - now.getTime())
        const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7))

        if (diffWeeks <= 0) return 0

        const needed = target - current
        if (needed <= 0) return 0

        return needed / diffWeeks
    }, [newAccountType, newAccountTargetAmount, newAccountTargetDate, newAccountAmount])


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
        }).reduce((sum, src) => sum + Number(src.amount), 0)
    }, [incomeSources])

    // Filtered Fixed Costs (Active)
    const activeFixedCosts = useMemo(() => {
        const now = new Date()
        return fixedCosts.filter(fc => {
            const from = fc.valid_from ? new Date(fc.valid_from) : null
            const to = fc.valid_to ? new Date(fc.valid_to) : null

            if (from && now < from) return false
            if (to && now > to) return false
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

        // 2. If Savings & Rate Calculated -> Create Fixed Cost
        if (newAccountType === 'savings' && calculatedWeeklyRate && calculatedWeeklyRate > 0) {
            const { error: fcError } = await supabase.from('fixed_costs').insert([{
                title: `Sparziel: ${newAccountName}`,
                amount: calculatedWeeklyRate * 4.33,
                valid_from: new Date().toISOString(),
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
    }

    const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
    const [editAccountName, setEditAccountName] = useState('')
    const [editAccountAmount, setEditAccountAmount] = useState('')
    const [editAccountTargetAmount, setEditAccountTargetAmount] = useState('')
    const [editAccountTargetDate, setEditAccountTargetDate] = useState('')
    const [editAccountMonths, setEditAccountMonths] = useState('')

    const handleStartEditAccount = (acc: Account) => {
        setEditingAccountId(acc.id)
        setEditAccountName(acc.name)
        setEditAccountAmount(acc.amount.toString())
        setEditAccountTargetAmount(acc.target_amount ? acc.target_amount.toString() : '')
        setEditAccountTargetDate(acc.target_date ? new Date(acc.target_date).toISOString().split('T')[0] : '')
        setEditAccountMonths(acc.months ? acc.months.toString() : '')
    }

    const handleSaveEditAccount = async () => {
        if (!editingAccountId || !editAccountName || !editAccountAmount) return

        const currentAccount = accounts.find(a => a.id === editingAccountId)
        if (!currentAccount) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        let updates: any = {
            name: editAccountName,
            amount: Number(editAccountAmount)
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
                    const diffTime = Math.abs(targetDate.getTime() - now.getTime())
                    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7))
                    const needed = target - current
                    if (diffWeeks > 0 && needed > 0) {
                        newRate = needed / diffWeeks
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
                    const { error } = await supabase.from('fixed_costs').insert([{ ...costData, valid_from: new Date().toISOString() }])
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
        const totalFixed = fixedCosts.reduce((acc, curr) => acc + Number(curr.amount), 0)
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

        // Account Overview Section
        let currentY = (doc as any).lastAutoTable.finalY + 15
        doc.setFontSize(14)
        doc.text('Konten Übersicht', 14, currentY)

        const accountsData = accounts.map(acc => [
            acc.name,
            acc.type === 'savings' ? 'Sparkonto' : 'Aufteilung',
            `€${acc.amount.toFixed(2)}`,
            acc.type === 'distribution' ? acc.months.toString() : '-'
        ])

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Name', 'Typ', 'Betrag', 'Monate']],
            body: accountsData.length ? accountsData : [['Keine Konten vorhanden', '-', '-', '-']],
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

        const fixedCostsData = fixedCosts.map(cost => [
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
        // We add a new page (or invisible text) containing the JSON data
        // Format: BACKUP_DATA_START:{...}:BACKUP_DATA_END
        const backupData = {
            monthly_budget: budget,
            fixedCosts: fixedCosts.map(fc => ({ title: fc.title, amount: fc.amount, valid_from: fc.valid_from, valid_to: fc.valid_to, linked_account_id: fc.linked_account_id })),
            accounts: accounts.map(acc => ({ name: acc.name, amount: acc.amount, months: acc.months, type: acc.type, target_amount: acc.target_amount, target_date: acc.target_date, start_amount: acc.start_amount })),
            expenses: expenses.map(e => ({ description: e.description, amount: e.amount, category: e.category, expense_date: e.expense_date || e.created_at })),
            incomeSources: incomeSources.map(inc => ({ title: inc.title, amount: inc.amount, frequency: inc.frequency, valid_from: inc.valid_from, valid_to: inc.valid_to })),
            timestamp: Date.now()
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

                    // 2. Insert new (Simplified)
                    if (data.incomeSources?.length) await supabase.from('income_sources').insert(data.incomeSources.map((x: any) => ({ ...x, user_id: user.id })))
                    if (data.accounts?.length) await supabase.from('accounts').insert(data.accounts.map((x: any) => ({ ...x, user_id: user.id })))
                    if (data.fixedCosts?.length) await supabase.from('fixed_costs').insert(data.fixedCosts.map((x: any) => ({ ...x, user_id: user.id })))
                    if (data.expenses?.length) await supabase.from('expenses').insert(data.expenses.map((x: any) => ({ ...x, user_id: user.id })))

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
                <div className="w-[86%] scale-[1.15] origin-top h-full">
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

    // --- ACCOUNTS SUB-VIEW ---
    if (showAccounts) {
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-right duration-300 flex justify-center">
                <div className="w-[86%] scale-[1.15] origin-top min-h-full flex flex-col max-w-2xl mx-auto">
                    <div className="p-8 flex items-center justify-between border-b border-white/20 shrink-0 bg-transparent sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setShowAccounts(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                                <ArrowLeft className="w-8 h-8" />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-800">Konten Verwalten</h1>
                        </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 pb-20">
                        {/* Add New Account */}
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                            <h3 className="font-bold text-gray-800">Neues Konto anlegen</h3>

                            {/* Type Selection */}
                            <div className="flex bg-gray-200 rounded-xl p-1">
                                <button
                                    onClick={() => setNewAccountType('distribution')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newAccountType === 'distribution' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                                >
                                    Aufteilung
                                </button>
                                <button
                                    onClick={() => setNewAccountType('savings')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newAccountType === 'savings' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                                >
                                    Sparkonto
                                </button>
                            </div>

                            <div className="space-y-3">
                                <input
                                    placeholder="Name des Kontos"
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                    className="w-full px-4 py-3 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none"
                                />
                                <div className="flex gap-3">
                                    <input
                                        type="number"
                                        placeholder="Aktueller Betrag (€)"
                                        value={newAccountAmount}
                                        onChange={(e) => setNewAccountAmount(e.target.value)}
                                        className="w-full px-4 py-3 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none"
                                    />
                                    {newAccountType === 'distribution' && (
                                        <input
                                            type="number"
                                            placeholder="Monate"
                                            value={newAccountMonths}
                                            onChange={(e) => setNewAccountMonths(e.target.value)}
                                            className="w-full px-4 py-3 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none"
                                        />
                                    )}
                                </div>

                                {newAccountType === 'savings' && (
                                    <div className="space-y-3 pt-2 border-t border-gray-200">
                                        <div className="flex gap-3">
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500 ml-2">Zielbetrag (€) (Optional)</label>
                                                <input
                                                    type="number"
                                                    placeholder="Ziel (€)"
                                                    value={newAccountTargetAmount}
                                                    onChange={(e) => setNewAccountTargetAmount(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs text-gray-500 ml-2">Zieldatum (Optional)</label>
                                                <input
                                                    type="date"
                                                    value={newAccountTargetDate}
                                                    onChange={(e) => setNewAccountTargetDate(e.target.value)}
                                                    className="w-full px-4 py-3 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-300 outline-none"
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
                            <h3 className="font-bold text-gray-800">Deine Konten</h3>
                            {accounts.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">Noch keine Konten angelegt.</p>
                            ) : (
                                <div className="space-y-3">
                                    {accounts.map(acc => {
                                        const isEditing = editingAccountId === acc.id

                                        if (isEditing) {
                                            return (
                                                <div key={acc.id} className="p-4 bg-white rounded-xl border-2 border-blue-500 shadow-lg space-y-3">
                                                    <div className="space-y-3">
                                                        <input
                                                            value={editAccountName}
                                                            onChange={e => setEditAccountName(e.target.value)}
                                                            className="w-full px-4 py-2 bg-gray-50 rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                            placeholder="Name"
                                                        />
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="number"
                                                                value={editAccountAmount}
                                                                onChange={e => setEditAccountAmount(e.target.value)}
                                                                className="flex-1 px-4 py-2 bg-gray-50 rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                                placeholder="Betrag"
                                                            />
                                                            {acc.type === 'distribution' && (
                                                                <input
                                                                    type="number"
                                                                    value={editAccountMonths}
                                                                    onChange={e => setEditAccountMonths(e.target.value)}
                                                                    className="flex-1 px-4 py-2 bg-gray-50 rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                                    placeholder="Monate"
                                                                />
                                                            )}
                                                        </div>
                                                        {acc.type === 'savings' && (
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="number"
                                                                    value={editAccountTargetAmount}
                                                                    onChange={e => setEditAccountTargetAmount(e.target.value)}
                                                                    className="flex-1 px-4 py-2 bg-gray-50 rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                                    placeholder="Ziel (€)"
                                                                />
                                                                <input
                                                                    type="date"
                                                                    value={editAccountTargetDate}
                                                                    onChange={e => setEditAccountTargetDate(e.target.value)}
                                                                    className="flex-1 px-4 py-2 bg-gray-50 rounded-lg border focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <button onClick={() => setEditingAccountId(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                                                            <button onClick={handleSaveEditAccount} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm">Speichern</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div
                                                key={acc.id}
                                                className={`p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group cursor-pointer hover:bg-gray-50 bg-white`}
                                                onClick={() => {
                                                    if (acc.type === 'savings') {
                                                        handleTransferFromSavings(acc)
                                                    }
                                                }}
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-gray-800">{acc.name}</p>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${acc.type === 'savings' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {acc.type === 'savings' ? 'Sparkonto' : 'Aufteilung'}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2 text-xs text-gray-500 font-medium mt-1">
                                                        <span className="bg-gray-100 px-2 py-0.5 rounded">€{acc.amount.toFixed(2)}</span>
                                                        {acc.type === 'distribution' && <span className="bg-gray-100 px-2 py-0.5 rounded">{acc.months} Monate übrig</span>}
                                                        {acc.type === 'savings' && acc.target_amount && (
                                                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">
                                                                Ziel: €{acc.target_amount} bis {acc.target_date ? new Date(acc.target_date).toLocaleDateString() : '?'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Progress Bar for Savings */}
                                                    {acc.type === 'savings' && acc.target_amount && (
                                                        <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
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
                                                        className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <FileText className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAccount(acc.id)}
                                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                <div className="w-[86%] scale-[1.15] origin-top min-h-full flex flex-col max-w-2xl mx-auto">
                    <div className="p-8 flex items-center justify-between border-b border-white/20 shrink-0 bg-transparent sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setShowFixedCosts(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                                <ArrowLeft className="w-8 h-8" />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-800">Fixkosten Verwalten</h1>
                        </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 pb-20">
                        {/* Add New Fixed Cost */}
                        <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100/50 space-y-4">
                            <h3 className="font-bold text-gray-800">Neue Fixkosten hinzufügen</h3>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        placeholder="Titel"
                                        value={newCostTitle}
                                        onChange={(e) => setNewCostTitle(e.target.value)}
                                        className="flex-[2] min-w-0 h-14 px-4 text-base md:text-lg bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                    />
                                    <input
                                        type="number"
                                        placeholder="€ (Monatlich)"
                                        value={newCostAmount}
                                        onChange={(e) => setNewCostAmount(e.target.value)}
                                        className="flex-1 min-w-0 h-14 px-4 text-base md:text-lg bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-red-500/50 outline-none"
                                    />
                                </div>
                                {/* Date Range */}
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 ml-2">Gültig ab</label>
                                        <input
                                            type="date"
                                            value={newCostValidFrom}
                                            onChange={(e) => setNewCostValidFrom(e.target.value)}
                                            className="w-full h-12 px-4 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-red-500/50 outline-none text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 ml-2">Gültig bis (Optional)</label>
                                        <input
                                            type="date"
                                            value={newCostValidTo}
                                            onChange={(e) => setNewCostValidTo(e.target.value)}
                                            className="w-full h-12 px-4 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-red-500/50 outline-none text-sm"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleAddCost}
                                    disabled={!newCostTitle || !newCostAmount}
                                    className="w-full h-12 px-6 bg-red-600 text-white hover:opacity-90 rounded-xl transition-colors shadow-md flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Hinzufügen
                                </button>
                            </div>
                        </div>

                        {/* Fixed Costs List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-gray-800">Deine Fixkosten</h3>
                                <span className="text-xs font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                                    Summe: €{totalFixed.toFixed(2)}
                                </span>
                            </div>

                            {activeFixedCosts.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">Noch keine aktiven Fixkosten.</p>
                            ) : (
                                <div className="space-y-3">
                                    {activeFixedCosts.map(cost => {
                                        const isSavings = !!cost.linked_account_id
                                        return (
                                            <div key={cost.id} className={`flex items-center justify-between p-4 bg-white rounded-xl border shadow-sm group ${isSavings ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}>
                                                <div className="min-w-0 flex-1 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-gray-800 truncate text-lg">{cost.title}</p>
                                                        {isSavings && (
                                                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                                                SPAREN
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-red-600 font-bold">-€{cost.amount.toFixed(2)}</p>
                                                    <div className="text-[10px] text-gray-400 mt-1">
                                                        {cost.valid_from && `Ab: ${new Date(cost.valid_from).toLocaleDateString()} `}
                                                        {cost.valid_to && `- Bis: ${new Date(cost.valid_to).toLocaleDateString()}`}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteCost(cost.id)}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                            <p className="text-xs text-red-700 leading-relaxed">
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
                <div className="w-[86%] scale-[1.15] origin-top min-h-full flex flex-col max-w-2xl mx-auto">
                    <div className="p-8 flex items-center justify-between border-b border-white/20 shrink-0 bg-transparent sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setShowIncome(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                                <ArrowLeft className="w-8 h-8" />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-800">Einnahmen Verwalten</h1>
                        </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 pb-20">
                        {/* Add New Income */}
                        <div className="bg-green-50/50 p-6 rounded-2xl border border-green-100/50 space-y-4">
                            <h3 className="font-bold text-gray-800">Neue Einnahme hinzufügen</h3>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        placeholder="Quelle (z.B. Gehalt)"
                                        value={newIncomeTitle}
                                        onChange={(e) => setNewIncomeTitle(e.target.value)}
                                        className="flex-[2] min-w-0 h-14 px-4 text-base md:text-lg bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none"
                                    />
                                    <input
                                        type="number"
                                        placeholder="€"
                                        value={newIncomeAmount}
                                        onChange={(e) => setNewIncomeAmount(e.target.value)}
                                        className="flex-1 min-w-0 h-14 px-4 text-base md:text-lg bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none"
                                    />
                                    <select
                                        value={newIncomeFrequency}
                                        onChange={(e: any) => setNewIncomeFrequency(e.target.value)}
                                        className="h-14 px-4 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-sm font-medium text-gray-600"
                                    >
                                        <option value="monthly">Monatlich</option>
                                        <option value="yearly">Jährlich</option>
                                        <option value="weekly">Wöchentlich</option>
                                        <option value="daily">Täglich</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 ml-2">Gültig ab</label>
                                        <input
                                            type="date"
                                            value={newIncomeValidFrom}
                                            onChange={(e) => setNewIncomeValidFrom(e.target.value)}
                                            className="w-full h-12 px-4 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 ml-2">Gültig bis (Optional)</label>
                                        <input
                                            type="date"
                                            value={newIncomeValidTo}
                                            onChange={(e) => setNewIncomeValidTo(e.target.value)}
                                            className="w-full h-12 px-4 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-green-500/50 outline-none text-sm"
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
                                <h3 className="font-bold text-gray-800">Deine Einnahmen</h3>
                                <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                                    Summe: €{Number(budget).toFixed(2)}
                                </span>
                            </div>

                            {incomeSources.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">Noch keine Einnahmen eingetragen.</p>
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
                                                <div key={src.id} className="p-4 bg-white rounded-xl border-2 border-green-500 shadow-lg space-y-3">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={editIncomeTitle}
                                                            onChange={e => setEditIncomeTitle(e.target.value)}
                                                            className="flex-[2] px-3 py-2 bg-gray-50 rounded-lg text-sm border focus:ring-2 focus:ring-green-500/50 outline-none"
                                                            placeholder="Titel"
                                                        />
                                                        <input
                                                            type="number"
                                                            value={editIncomeAmount}
                                                            onChange={e => setEditIncomeAmount(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm border focus:ring-2 focus:ring-green-500/50 outline-none"
                                                            placeholder="Amount"
                                                        />
                                                        <select
                                                            value={editIncomeFrequency}
                                                            onChange={(e: any) => setEditIncomeFrequency(e.target.value)}
                                                            className="px-3 py-2 bg-gray-50 rounded-lg text-sm border focus:ring-2 focus:ring-green-500/50 outline-none"
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
                                                            className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-xs border"
                                                        />
                                                        <input
                                                            type="date"
                                                            value={editIncomeValidTo}
                                                            onChange={e => setEditIncomeValidTo(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-xs border"
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <button onClick={() => setEditingIncomeId(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                                                        <button onClick={handleSaveEditIncome} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-sm">Speichern</button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div key={src.id} className={`flex flex-col p-4 rounded-xl border shadow-sm group transition-all ${isActive ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 flex-1 mr-4">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-gray-800 truncate text-lg">{src.title}</p>
                                                            {!isActive && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Inaktiv</span>}
                                                            {!src.valid_to && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold border border-blue-100">Unbegrenzt</span>}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <p className="text-sm text-green-600 font-bold">
                                                                +€{Number(src.amount).toFixed(2)}
                                                                <span className="text-[10px] text-gray-400 font-normal ml-1">
                                                                    ({src.frequency === 'daily' ? 'Tgl.' : src.frequency === 'weekly' ? 'Wöch.' : src.frequency === 'yearly' ? 'Jährl.' : 'Mtl.'})
                                                                </span>
                                                            </p>
                                                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
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
                                                            className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Bearbeiten"
                                                        >
                                                            <FileText className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteIncome(src.id)}
                                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
        <div className={`fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right duration-300 flex justify-center theme-${theme} pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none`} >
            <div className={`w-[86%] scale-[1.15] origin-top min-h-full md:w-5/6 md:max-w-2xl flex flex-col md:border-x border-primary/10 dark:border-white/5 transition-colors duration-300`}>
                {/* Header */}
                <div className="p-4 md:p-8 flex items-center justify-between border-b border-primary/10 shrink-0 bg-transparent sticky top-0 z-20 backdrop-blur-xl">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button onClick={onBack} className="p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors">
                            <ArrowLeft className="w-8 h-8" />
                        </button>
                        <h1 className="text-xl md:text-3xl font-bold text-foreground dark:text-white">Einstellungen</h1>
                    </div>
                    <div className="flex gap-1 md:gap-2">
                        <button
                            onClick={() => setShowImportWizard(true)}
                            className="p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors"
                            title="Kontoauszug Importieren"
                        >
                            <FileText className="w-8 h-8" />
                        </button>
                        <label className="p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors cursor-pointer" title="Backup wiederherstellen">
                            <Upload className="w-8 h-8" />
                            <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={handleRestoreBackup}
                            />
                        </label>
                        <button
                            onClick={handleDownloadFullReport}
                            className="p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors"
                            title="PDF Report & Backup Laden"
                        >
                            <Download className="w-8 h-8" />
                        </button>
                    </div>
                </div>


                <div className="p-4 md:p-10 space-y-6 md:space-y-8 flex-1 pb-32">

                    {/* Monthly Budget Section */}
                    {/* Income Sources Section */}
                    <div className="bg-card dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg md:text-2xl font-bold text-foreground dark:text-gray-100">Monatliche Einnahmen</h3>
                            <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                                Summe: €{Number(budget).toFixed(2)}
                            </span>
                        </div>

                        <button
                            onClick={() => setShowIncome(true)}
                            className="w-full h-16 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors flex items-center justify-between px-6 font-bold group"
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
                    <div className="bg-card dark:bg-gray-900/50 dark:backdrop-blur-md dark:border dark:border-white/5 shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg md:text-2xl font-bold text-foreground dark:text-gray-100">Fixkosten</h3>
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                                Summe: €{totalFixed.toFixed(2)}
                            </span>
                        </div>

                        <button
                            onClick={() => setShowFixedCosts(true)}
                            className="w-full h-16 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-between px-6 font-bold group"
                        >
                            <span className="flex items-center gap-3">
                                <Wallet className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                <span className="text-base md:text-lg">Fixkosten verwalten</span>
                            </span>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold">€{totalFixed.toFixed(2)}</span>
                                <span className="text-[10px] opacity-70">{fixedCosts.length} Posten</span>
                            </div>
                        </button>
                    </div>

                    {/* Design Section */}
                    <div className="bg-card shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <h3 className="text-lg md:text-2xl font-bold text-foreground">Design</h3>
                        <div className="w-full">
                            <select
                                value={theme}
                                onChange={(e) => setTheme(e.target.value)}
                                className="w-full h-16 text-center border-none shadow-sm rounded-xl bg-muted/30 outline-none focus:ring-2 focus:ring-primary/50 appearance-none font-bold text-foreground text-lg cursor-pointer"
                            >
                                <option value="white">Papier Weiß </option>
                                <option value="pink">Rosa </option>
                                <option value="blue">Blau </option>
                                <option value="green">Grün </option>
                                <option value="yellow">Gelb </option>
                            </select>
                        </div>

                        {/* Dark Mode Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className={`w-full h-16 rounded-xl flex items-center justify-between px-6 font-bold transition-all shadow-sm border-2 ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-800'}`}
                        >
                            <span className="flex items-center gap-3">
                                {isDarkMode ? <Moon className="w-6 h-6 text-blue-400" /> : <Sun className="w-6 h-6 text-orange-400" />}
                                <span className="text-lg">Dark Mode</span>
                            </span>
                            <div className={`w-12 h-7 rounded-full relative transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-gray-300'}`}>
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${isDarkMode ? 'left-6' : 'left-1'}`}></div>
                            </div>
                        </button>
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
        </div >

    )
}
