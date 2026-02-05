'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, Save, LogOut, Wallet, Download, Upload } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
// Set worker source for pdfjs
import { supabase } from '@/utils/supabase'
import { Expense, FixedCost, Settings, Account } from '@/app/types'

type SettingsOverlayProps = {
    onBack: () => void
    settings: Settings
    fixedCosts: FixedCost[]
    accounts?: Account[]
    theme: string
    setTheme: (theme: string) => void
    onLogout: () => void
    onUpdate?: () => void
    expenses: Expense[]
}

export default function SettingsOverlay({ onBack, settings, fixedCosts, accounts = [], theme, setTheme, onLogout, onUpdate, expenses }: SettingsOverlayProps) {
    const [budget, setBudget] = useState<string | number>(settings?.monthly_budget || 0)

    // Accounts State
    const [showAccounts, setShowAccounts] = useState(false)
    const [newAccountName, setNewAccountName] = useState('')
    const [newAccountAmount, setNewAccountAmount] = useState('')
    const [newAccountMonths, setNewAccountMonths] = useState('')
    const [newAccountType, setNewAccountType] = useState<'distribution' | 'savings'>('distribution')

    const [newCostTitle, setNewCostTitle] = useState('')
    const [newCostAmount, setNewCostAmount] = useState('')

    // Sync state with prop when it changes
    useEffect(() => {
        if (settings) {
            setBudget(settings.monthly_budget)
        }
    }, [settings])

    const handleSave = async () => {
        try {
            // 1. Fetch current user settings to get the correct ID, ignoring props
            const { data: currentSettings, error: fetchError } = await supabase
                .from('settings')
                .select('id')
                .limit(1)
                .maybeSingle()

            if (fetchError) throw fetchError

            if (currentSettings) {
                // 2. Update existing
                const { error: updateError } = await supabase
                    .from('settings')
                    .update({ monthly_budget: Number(budget) })
                    .eq('id', currentSettings.id)

                if (updateError) throw updateError
            } else {
                // 3. Insert new if none exist
                const { error: insertError } = await supabase
                    .from('settings')
                    .insert([{ monthly_budget: Number(budget) }])

                if (insertError) throw insertError
            }

            onUpdate?.()
            alert('Einstellungen erfolgreich gespeichert!')

        } catch (error: any) {
            console.error('Error saving settings:', error)
            alert('Fehler beim Speichern: ' + (error.message || 'Unbekannter Fehler'))
        }
    }


    const handleAddCost = async () => {
        if (!newCostTitle || !newCostAmount) return
        const { error } = await supabase.from('fixed_costs').insert([{ title: newCostTitle, amount: Number(newCostAmount) }])
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
        const months = newAccountType === 'distribution' ? Number(newAccountMonths) : 0
        const { error } = await supabase.from('accounts').insert([{ name: newAccountName, amount: Number(newAccountAmount), months, type: newAccountType }])
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
                category: 'Sparen'
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
            ['Monatsbudget', `€${Number(budget).toFixed(2)}`],
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

            // 2. Clear old Fixed Costs
            const { error: delFcError } = await supabase.from('fixed_costs').delete().neq('id', -1) // Delete all
            if (delFcError) throw delFcError

            // 3. Insert new Fixed Costs
            if (data.fixedCosts && data.fixedCosts.length > 0) {
                const { error: insFcError } = await supabase.from('fixed_costs').insert(data.fixedCosts)
                if (insFcError) throw insFcError
            }

            // 4. Clear old Accounts
            const { error: delAccError } = await supabase.from('accounts').delete().neq('id', -1)
            if (delAccError) throw delAccError

            // 5. Insert new Accounts
            if (data.accounts && data.accounts.length > 0) {
                const { error: insAccError } = await supabase.from('accounts').insert(data.accounts)
                if (insAccError) throw insAccError
            }

            // 6. Clear & Restore Expenses
            const { error: delExpError } = await supabase.from('expenses').delete().neq('id', -1)
            if (delExpError) throw delExpError

            if (data.expenses && data.expenses.length > 0) {
                // Insert in chunks to avoid payload too large if many expenses
                const { error: insExpError } = await supabase.from('expenses').insert(data.expenses)
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
                                                    const amount = prompt(`Geld von "${acc.name}" zum Budget hinzufügen? Betrag eingeben:`)
                                                    if (amount) {
                                                        import('@/app/actions').then(mod => mod.transferFromSavings(acc.id, parseFloat(amount)))
                                                    }
                                                }
                                            }}
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-gray-800">{acc.name}</p>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${acc.type === 'savings' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {acc.type === 'savings' ? 'Spar' : 'Aufteilung'}
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

    // --- MAIN SETTINGS VIEW ---
    return (
        <div className={`fixed inset-0 z-50 h-dvh w-screen bg-black/20 backdrop-blur-sm animate-in fade-in slide-in-from-right duration-300 flex justify-center theme-${theme} pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}>
            <div className="h-full w-full md:w-5/6 md:max-w-2xl bg-background/90 backdrop-blur-md shadow-2xl flex flex-col md:border-x border-primary/10 overflow-y-auto">
                {/* Header */}
                <div className="p-4 md:p-8 flex items-center justify-between border-b border-primary/10 shrink-0 bg-transparent sticky top-0 z-20 backdrop-blur-xl">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button onClick={onBack} className="p-2 text-muted-foreground hover:bg-muted/50 rounded-full transition-colors">
                            <ArrowLeft className="w-8 h-8" />
                        </button>
                        <h1 className="text-xl md:text-3xl font-bold text-foreground">Einstellungen</h1>
                    </div>
                    <div className="flex gap-1 md:gap-2">
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
                    <div className="bg-card shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <h3 className="text-lg md:text-2xl font-bold text-foreground">Finanzen</h3>

                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Monatsbudget (€)</label>
                            <input
                                type="number"
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                className="w-full h-14 px-4 text-lg bg-muted/30 rounded-xl text-foreground font-bold focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                            />
                        </div>

                        {/* Konten Button */}
                        <button
                            onClick={() => setShowAccounts(true)}
                            className="w-full h-16 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-between px-6 font-bold group"
                        >
                            <span className="flex items-center gap-3">
                                <Wallet className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                <span className="text-base md:text-lg">Konten</span>
                            </span>
                            <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full">
                                {accounts.length} Aktiv
                            </span>
                        </button>

                        <button
                            onClick={handleSave}
                            className="w-full h-14 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center shadow-md font-bold text-lg"
                        >
                            <Save className="w-8 h-8 mr-2" /> Speichern
                        </button>
                    </div>

                    {/* Fixed Costs Section */}
                    <div className="bg-card shadow-md rounded-2xl p-4 md:p-8 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg md:text-2xl font-bold text-foreground">Fixkosten</h3>
                            <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
                                Summe: €{totalFixed.toFixed(2)}
                            </span>
                        </div>

                        {/* List */}
                        <div className="space-y-3">
                            {fixedCosts.map(cost => (
                                <div key={cost.id} className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-primary/5 group">
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
                            <span className="text-2xl font-extrabold text-primary">€{(available / 4).toFixed(2)}</span>
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