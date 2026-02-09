'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Plus, Trash2, Save, LogOut, Wallet, Download, Upload, ArrowDown, Calculator, LayoutDashboard, Moon, Sun, FileText } from 'lucide-react'
import { startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'
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
    const [settingsTab, setSettingsTab] = useState<'settings' | 'calculation'>('settings')
    const [showImportWizard, setShowImportWizard] = useState(false)

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
    const [showAccounts, setShowAccounts] = useState(false)
    const [newAccountName, setNewAccountName] = useState('')
    const [newAccountAmount, setNewAccountAmount] = useState('')
    const [newAccountMonths, setNewAccountMonths] = useState('')
    const [newAccountType, setNewAccountType] = useState<'distribution' | 'savings'>('distribution')

    const [newCostTitle, setNewCostTitle] = useState('')
    const [newCostAmount, setNewCostAmount] = useState('')

    // Calculated Budget
    const budget = useMemo(() => {
        const now = new Date()
        return incomeSources.filter(src => {
            const from = src.valid_from ? new Date(src.valid_from) : null
            const to = src.valid_to ? new Date(src.valid_to) : null

            // Check if current date is within range
            // We ignore time for the check, just compare dates
            if (from && now < from) return false
            if (to && now > to) return false
            return true
        }).reduce((sum, src) => sum + Number(src.amount), 0)
    }, [incomeSources])

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
            user_id: user.id
        }])
        if (error) console.error(error)
        else onUpdate?.()
        setNewCostTitle('')
        setNewCostAmount('')
    }

    const handleDeleteCost = async (id: number) => {
        const { error } = await supabase.from('fixed_costs').delete().eq('id', id)
        if (error) console.error(error)
        else onUpdate?.()
    }

    const handleAddAccount = async () => {
        if (!newAccountName || !newAccountAmount) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        const months = newAccountType === 'distribution' ? Number(newAccountMonths) : 0
        const { error } = await supabase.from('accounts').insert([{
            name: newAccountName,
            amount: Number(newAccountAmount),
            months,
            type: newAccountType,
            user_id: user.id
        }])
        if (error) console.error(error)
        else onUpdate?.()
        setNewAccountName('')
        setNewAccountAmount('')
        setNewAccountMonths('')
    }

    const handleDeleteAccount = async (id: number) => {
        const { error } = await supabase
            .from('accounts')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting account:', error)
        } else {
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
            ['Verfügbar (Woche)', `€${(available / 4).toFixed(2)}`]
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
            fixedCosts: fixedCosts.map(fc => ({ title: fc.title, amount: fc.amount })), // Exclude IDs to be safe/fresh on restore
            accounts: accounts.map(acc => ({ name: acc.name, amount: acc.amount, months: acc.months, type: acc.type })),
            expenses: expenses.map(e => ({ description: e.description, amount: e.amount, category: e.category, expense_date: e.expense_date || e.created_at })),
            timestamp: Date.now()
        }
        const backupString = `BACKUP_DATA_START:${JSON.stringify(backupData)}:BACKUP_DATA_END`

        doc.addPage()
        doc.setFontSize(1) // Tiny font
        doc.setTextColor(255, 255, 255) // White/Invisible
        // Remove maxWidth to ensure it's a single long string without pdf-forced line breaks
        doc.text(backupString, 10, 10)

        doc.save('finanzuebersicht_backup.pdf')
    }

    const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!confirm('Achtung: Dies wird ALLE deine aktuellen Daten (Budget, Fixkosten, Konten UND AUSGABEN) löschen und mit dem Backup überschreiben. Fortfahren?')) {
            e.target.value = '' // reset input
            return
        }

        try {
            const buffer = await file.arrayBuffer()

            // Lazy load pdfjs
            const pdfjsLib = await import('pdfjs-dist')
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

            const pdf = await pdfjsLib.getDocument(buffer).promise
            let fullText = ''

            // Extract text from all pages
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i)
                const textContent = await page.getTextContent()
                const pageText = textContent.items.map((item: any) => item.str).join('')
                fullText += pageText
            }

            // Find JSON data - use [\s\S] to match across newlines if any occurred
            const match = fullText.match(/BACKUP_DATA_START:([\s\S]*?):BACKUP_DATA_END/)

            if (!match || !match[1]) {
                console.warn('Backup markers not found in:', fullText.slice(-200)) // Log last chars
                alert('Keine gültigen Backup-Daten gefunden. \n\nHast du dieses PDF ERST JETZT neu heruntergeladen? Alte PDFs enthalten diese Daten noch nicht.')
                return
            }

            const data = JSON.parse(match[1])
            console.log('Restoring data:', data)

            // 1. Update Settings (Budget)
            if (data.monthly_budget !== undefined) {
                await supabase.from('settings').update({ monthly_budget: data.monthly_budget }).eq('id', settings.id)
            }

            // Get Current User ID for all inserts
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Nicht eingeloggt')

            // 2. Clear old Fixed Costs
            const { error: delFcError } = await supabase.from('fixed_costs').delete().neq('id', -1) // Delete all
            if (delFcError) throw delFcError

            // 3. Insert new Fixed Costs - force user_id
            if (data.fixedCosts && data.fixedCosts.length > 0) {
                const costsWithUser = data.fixedCosts.map((fc: any) => ({ ...fc, user_id: user.id }))
                const { error: insFcError } = await supabase.from('fixed_costs').insert(costsWithUser)
                if (insFcError) throw insFcError
            }

            // 4. Clear old Accounts
            const { error: delAccError } = await supabase.from('accounts').delete().neq('id', -1)
            if (delAccError) throw delAccError

            // 5. Insert new Accounts - force user_id
            if (data.accounts && data.accounts.length > 0) {
                const accsWithUser = data.accounts.map((acc: any) => ({ ...acc, user_id: user.id }))
                const { error: insAccError } = await supabase.from('accounts').insert(accsWithUser)
                if (insAccError) throw insAccError
            }

            // 6. Clear & Restore Expenses
            const { error: delExpError } = await supabase.from('expenses').delete().neq('id', -1)
            if (delExpError) throw delExpError

            if (data.expenses && data.expenses.length > 0) {
                // Insert in chunks to avoid payload too large if many expenses
                const expsWithUser = data.expenses.map((e: any) => ({ ...e, user_id: user.id }))
                const { error: insExpError } = await supabase.from('expenses').insert(expsWithUser)
                if (insExpError) throw insExpError
            }

            alert('Backup erfolgreich wiederhergestellt!')
            onUpdate?.() // Refresh parent
            onBack?.() // Close overlay

        } catch (err) {
            console.error('Restore error:', err)
            alert('Fehler beim Wiederherstellen: ' + (err as Error).message)
        } finally {
            e.target.value = '' // reset input
        }
    }

    const totalFixed = fixedCosts.reduce((acc, curr) => acc + Number(curr.amount), 0)
    const available = Number(budget) - totalFixed

    // --- CALCULATION LOGIC ---
    const weeklyGross = Number(budget) / 4.33
    const weeklyFixed = totalFixed / 4.33

    const currentWeekExpenses = useMemo(() => {
        const now = new Date()
        const start = startOfWeek(now, { weekStartsOn: 1 })
        const end = endOfWeek(now, { weekStartsOn: 1 })
        return expenses.filter(e => {
            const d = new Date(e.expense_date || e.created_at)
            return isWithinInterval(d, { start, end })
        }).reduce((acc, curr) => acc + Number(curr.amount), 0)
    }, [expenses])

    const weeklyNet = weeklyGross - weeklyFixed
    const weeklySavings = weeklyNet - currentWeekExpenses
    const projectedMonthlySavings = weeklySavings * 4.33

    // --- IMPORT WIZARD ---
    if (showImportWizard) {
        return (
            <ImportWizard
                onClose={() => setShowImportWizard(false)}
                onImportSuccess={() => {
                    onUpdate?.()
                }}
            />
        )
    }

    // --- ACCOUNTS SUB-VIEW ---
    if (showAccounts) {
        return (
            <div className="fixed inset-0 z-50 h-dvh w-screen overflow-y-auto bg-black/20 backdrop-blur-sm animate-in fade-in slide-in-from-right duration-300 flex justify-center">
                <div className="min-h-full w-5/6 bg-background/80 backdrop-blur-md shadow-2xl flex flex-col border-x border-white/20">
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
                                    Girokonto
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
                                        placeholder="Betrag (€)"
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
                                    {accounts.map(acc => (
                                        <div
                                            key={acc.id}
                                            className={`p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group cursor-pointer hover:bg-gray-50 bg-white`}
                                            onClick={() => {
                                                if (acc.type === 'savings') {
                                                    handleTransferFromSavings(acc)
                                                }
                                            }}
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-gray-800">{acc.name}</p>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${acc.type === 'savings' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {acc.type === 'savings' ? 'Giro' : 'Aufteilung'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2 text-xs text-gray-500 font-medium">
                                                    <span className="bg-gray-100 px-2 py-0.5 rounded">€{acc.amount.toFixed(2)}</span>
                                                    {acc.type === 'distribution' && <span className="bg-gray-100 px-2 py-0.5 rounded">{acc.months} Monate übrig</span>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteAccount(acc.id)
                                                }}
                                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                            <p className="text-xs text-blue-700 leading-relaxed">
                                💡 Das Guthaben dieser Konten wird automatisch über die angegebene Anzahl an Monaten auf dein monatliches Budget aufgeteilt.
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
            <div className="fixed inset-0 z-50 h-dvh w-screen overflow-y-auto bg-black/20 backdrop-blur-sm animate-in fade-in slide-in-from-right duration-300 flex justify-center">
                <div className="min-h-full w-5/6 bg-background/80 backdrop-blur-md shadow-2xl flex flex-col border-x border-white/20">
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
                                💡 Diese Einnahmen bilden dein monatliches Grundbudget.
                            </p>
                        </div>

                    </div>
                </div>
            </div>
        )
    }

    // --- MAIN SETTINGS VIEW ---
    return (
        <div className={`fixed inset-0 z-50 h-dvh w-screen bg-black/20 backdrop-blur-sm animate-in fade-in slide-in-from-right duration-300 flex justify-center theme-${theme} pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}>
            <div className={`h-full w-full md:w-5/6 md:max-w-2xl bg-background/90 dark:bg-gray-950/90 backdrop-blur-md shadow-2xl flex flex-col md:border-x border-primary/10 dark:border-white/5 overflow-y-auto transition-colors duration-300`}>
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

                {/* TAB SWITCHER */}
                <div className="px-4 md:px-10 mt-4">
                    <div className="flex bg-gray-200/50 dark:bg-gray-800/50 p-1 rounded-xl">
                        <button
                            onClick={() => setSettingsTab('settings')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${settingsTab === 'settings' ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            Einstellungen
                        </button>
                        <button
                            onClick={() => setSettingsTab('calculation')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${settingsTab === 'calculation' ? 'bg-white dark:bg-gray-700 shadow-sm text-black dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                        >
                            <Calculator className="w-4 h-4" />
                            Rechenweg
                        </button>
                    </div>
                </div>

                {settingsTab === 'calculation' ? (
                    <div className="p-4 md:p-10 pb-32 space-y-8 animate-in fade-in zoom-in-95 duration-300">
                        {/* 1. Monthly Income */}
                        <div className="flex flex-col items-center">
                            <div className="bg-blue-100 text-blue-800 p-4 rounded-xl font-bold mb-2 shadow-sm text-center w-full max-w-xs">
                                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Monatsbudget</div>
                                <div className="text-2xl">€{Number(budget).toFixed(2)}</div>
                            </div>
                            <div className="flex flex-col items-center text-gray-400 my-1">
                                <ArrowDown className="w-6 h-6" />
                                <span className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-gray-100 mb-1">÷ 4.33</span>
                                <ArrowDown className="w-6 h-6" />
                            </div>
                        </div>

                        {/* 2. Weekly Gross */}
                        <div className="flex flex-col items-center">
                            <div className="bg-white border-2 border-blue-100 text-gray-800 p-4 rounded-xl font-bold mb-4 shadow-sm text-center w-full max-w-xs">
                                <div className="text-xs uppercase tracking-wide opacity-50 mb-1">Wochenbudget (Brutto)</div>
                                <div className="text-xl">€{weeklyGross.toFixed(2)}</div>
                            </div>

                            {/* Branching */}
                            <div className="w-full max-w-md flex justify-between relative">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center border border-white z-10 text-xs font-bold text-gray-500">-</div>
                                <div className="w-1/2 border-t-2 border-r-2 border-gray-200 h-8 rounded-tr-xl absolute left-0 top-4 -translate-y-full transform -scale-x-100"></div>
                                <div className="w-1/2 border-t-2 border-l-2 border-gray-200 h-8 rounded-tl-xl absolute right-0 top-4 -translate-y-full"></div>
                            </div>

                            <div className="flex gap-4 w-full">
                                {/* Left Branch: Fixed Costs */}
                                <div className="flex-1 flex flex-col items-center space-y-2">
                                    <div className="bg-red-50 border border-red-100 p-3 rounded-xl w-full text-center">
                                        <div className="text-[10px] uppercase text-red-400 font-bold">Fixkosten (Wöchtl.)</div>
                                        <div className="text-red-600 font-bold">€{weeklyFixed.toFixed(2)}</div>
                                        <div className="text-[10px] text-gray-400 mt-1">(Monatlich €{totalFixed.toFixed(2)} ÷ 4.33)</div>
                                    </div>
                                </div>

                                {/* Right Branch: Variable Costs */}
                                <div className="flex-1 flex flex-col items-center space-y-2">
                                    <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl w-full text-center">
                                        <div className="text-[10px] uppercase text-orange-400 font-bold">Ausgaben (Aktuell)</div>
                                        <div className="text-orange-600 font-bold">€{currentWeekExpenses.toFixed(2)}</div>
                                        <div className="text-[10px] text-gray-400 mt-1">Laufende Woche</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Result / Savings */}
                        <div className="flex flex-col items-center pt-4">
                            <div className="flex flex-col items-center text-gray-400 my-1">
                                <ArrowDown className="w-6 h-6" />
                                <span className="text-xs font-bold text-gray-500">=</span>
                                <ArrowDown className="w-6 h-6" />
                            </div>

                            <div className={`p-4 rounded-xl font-bold mb-2 shadow-sm text-center w-full max-w-xs ${weeklySavings >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Verbleibend / Erspart (Woche)</div>
                                <div className="text-2xl">€{weeklySavings.toFixed(2)}</div>
                            </div>

                            <div className="flex flex-col items-center text-gray-400 my-1">
                                <ArrowDown className="w-6 h-6" />
                                <span className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-gray-100 mb-1">× 4.33</span>
                                <ArrowDown className="w-6 h-6" />
                            </div>

                            <div className={`border-2 border-dashed p-4 rounded-xl font-bold mb-2 text-center w-full max-w-xs ${weeklySavings >= 0 ? 'border-green-200 text-green-600' : 'border-red-200 text-red-600'}`}>
                                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Hochrechnung (Monat)</div>
                                <div className="text-xl">€{projectedMonthlySavings.toFixed(2)}</div>
                            </div>
                        </div>

                    </div>
                ) : (
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

                            {/* List */}
                            <div className="space-y-3">
                                {fixedCosts.map(cost => (
                                    <div key={cost.id} className="flex items-center justify-between p-4 bg-background/50 dark:bg-gray-800/30 rounded-xl border border-primary/5 dark:border-white/5 group">
                                        <div className="min-w-0 flex-1 mr-4">
                                            <p className="font-bold text-foreground truncate text-base md:text-lg">{cost.title}</p>
                                            <p className="text-xs text-muted-foreground font-medium">-€{cost.amount.toFixed(2)}</p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteCost(cost.id)}
                                            className="p-3 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-6 h-6" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add New */}
                            <div className="bg-primary/5 p-4 rounded-xl border border-primary/5 flex flex-col gap-3">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Neue Fixkosten hinzufügen</span>
                                <div className="flex gap-2">
                                    <input
                                        placeholder="Titel"
                                        value={newCostTitle}
                                        onChange={(e) => setNewCostTitle(e.target.value)}
                                        className="flex-[2] min-w-0 h-14 px-4 text-base md:text-lg bg-muted/40 rounded-lg outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/70"
                                    />
                                    <input
                                        type="number"
                                        placeholder="€"
                                        value={newCostAmount}
                                        onChange={(e) => setNewCostAmount(e.target.value)}
                                        className="flex-1 min-w-0 h-14 px-4 text-base md:text-lg bg-muted/40 rounded-lg outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/70"
                                    />
                                    <button
                                        onClick={handleAddCost}
                                        className="h-14 w-14 bg-primary text-primary-foreground hover:opacity-90 rounded-lg transition-colors shadow-sm flex items-center justify-center"
                                        title="Add"
                                    >
                                        <Plus className="w-8 h-8" />
                                    </button>
                                </div>
                            </div>
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
                                    <option value="white">Papier Weiß 📄</option>
                                    <option value="pink">Rosa 🌸</option>
                                    <option value="blue">Blau 🌊</option>
                                    <option value="green">Grün 🌿</option>
                                    <option value="yellow">Gelb ☀️</option>
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
                )}
            </div>
        </div>
    )
}