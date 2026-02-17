'use client'

import { useState } from 'react'
import { parseFullImport, ImportData } from '@/utils/parseFullImport'
import { bulkImportAll } from '@/app/actions/import'
import { X, Check, ArrowRight, Save, Trash2, HelpCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function ImportWizard({ onClose, onImportSuccess }: { onClose: () => void, onImportSuccess: () => void }) {
    const [step, setStep] = useState<'paste' | 'preview'>('paste')
    const [text, setText] = useState('')
    const [parsedData, setParsedData] = useState<ImportData | null>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [activeTab, setActiveTab] = useState<'expenses' | 'income' | 'fixed' | 'accounts'>('expenses')

    const handleAnalyze = () => {
        const _parsed = parseFullImport(text)
        if (
            _parsed.expenses.length === 0 &&
            _parsed.income.length === 0 &&
            _parsed.fixedCosts.length === 0 &&
            _parsed.accounts.length === 0
        ) {
            alert('Keine gültigen Daten gefunden! Bitte Format prüfen.')
            return
        }
        setParsedData(_parsed)
        setStep('preview')
    }

    const handleImport = async () => {
        if (!parsedData) return
        setIsImporting(true)

        // Convert Date objects to ISO strings
        const payload = {
            expenses: parsedData.expenses.map(p => ({
                amount: p.amount,
                category: p.category,
                description: p.description,
                expense_date: p.date.toISOString()
            })),
            income: parsedData.income.map(i => ({
                title: i.title,
                amount: i.amount,
                frequency: i.frequency,
                valid_from: i.valid_from?.toISOString(),
                valid_to: i.valid_to?.toISOString()
            })),
            fixedCosts: parsedData.fixedCosts.map(fc => ({
                title: fc.title,
                amount: fc.amount,
                valid_from: fc.valid_from?.toISOString(),
                valid_to: fc.valid_to?.toISOString()
            })),
            accounts: parsedData.accounts.map(a => ({
                name: a.name,
                amount: a.amount,
                type: a.type,
                valid_from: a.valid_from?.toISOString()
            }))
        }

        const res = await bulkImportAll(payload)

        setIsImporting(false)
        if (res.success && res.results) {
            const counts = []
            if (res.results.expenses) counts.push(`${res.results.expenses} Ausgaben`)
            if (res.results.income) counts.push(`${res.results.income} Einnahmen`)
            if (res.results.fixedCosts) counts.push(`${res.results.fixedCosts} Fixkosten`)
            if (res.results.accounts) counts.push(`${res.results.accounts} Konten`)

            alert(`Erfolgreich importiert:\n${counts.join('\n')}`)
            if (res.results.errors.length > 0) {
                alert(`Warnungen:\n${res.results.errors.join('\n')}`)
            }
            onImportSuccess()
            onClose()
        } else {
            alert('Fehler beim Import: ' + (res.error || 'Unbekannter Fehler'))
        }
    }

    const setExampleText = () => {
        const example = `# Konten
Girokonto; 2500; Distribution; 01.01.2025
Sparkasse; 5000; Savings; 01.01.2025

# Einnahmen
Gehalt; 3200; monthly; 01.01.2020
Bonus; 1500; yearly

# Fixkosten
Miete; 950; 01.01.2024
Netflix; 17.99
Fitnessstudio; 49.90; 01.01.2024; 31.12.2025

# Ausgaben
05.02.2026 -12,99 EUR REWE
04.02.2026 -45,00 EUR Tankstelle
03.02.2026 -9,50 EUR McDonald's
01.02.2026 -3,20 EUR Bäckerei
28.01.2026 -120,00 EUR Amazon
`
        setText(example)
    }

    // Render Helpers
    const renderPreviewTab = () => {
        if (!parsedData) return null

        // Expenses Tab
        if (activeTab === 'expenses') {
            return (
                <div className="overflow-y-auto h-full">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="p-2 text-sm font-bold text-gray-500">Datum</th>
                                <th className="p-2 text-sm font-bold text-gray-500">Kategorie</th>
                                <th className="p-2 text-sm font-bold text-gray-500 text-right">Betrag</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedData.expenses.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-50">
                                    <td className="p-2 text-sm">{format(row.date, 'dd.MM')}</td>
                                    <td className="p-2 text-sm">{row.category} <span className="text-gray-400 text-xs">({row.description})</span></td>
                                    <td className="p-2 text-sm text-right text-red-500 font-bold">-€{row.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {parsedData.expenses.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Keine Ausgaben gefunden.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )
        }

        // Income Tab
        if (activeTab === 'income') {
            return (
                <div className="overflow-y-auto h-full">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="p-2 text-sm font-bold text-gray-500">Titel</th>
                                <th className="p-2 text-sm font-bold text-gray-500">Intervall</th>
                                <th className="p-2 text-sm font-bold text-gray-500 text-right">Betrag</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedData.income.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-50">
                                    <td className="p-2 text-sm font-bold">{row.title}</td>
                                    <td className="p-2 text-sm">{row.frequency}</td>
                                    <td className="p-2 text-sm text-right text-green-600 font-bold">+€{row.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {parsedData.income.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Keine Einnahmen gefunden.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )
        }

        // Fixed Costs Tab
        if (activeTab === 'fixed') {
            return (
                <div className="overflow-y-auto h-full">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="p-2 text-sm font-bold text-gray-500">Titel</th>
                                <th className="p-2 text-sm font-bold text-gray-500">Zeitraum</th>
                                <th className="p-2 text-sm font-bold text-gray-500 text-right">Betrag</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedData.fixedCosts.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-50">
                                    <td className="p-2 text-sm font-bold">{row.title}</td>
                                    <td className="p-2 text-sm text-xs text-gray-500">
                                        {row.valid_from ? format(row.valid_from, 'dd.MM.yy') : 'start'} - {row.valid_to ? format(row.valid_to, 'dd.MM.yy') : 'open'}
                                    </td>
                                    <td className="p-2 text-sm text-right text-orange-600 font-bold">-€{row.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {parsedData.fixedCosts.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Keine Fixkosten gefunden.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )
        }

        // Accounts Tab
        if (activeTab === 'accounts') {
            return (
                <div className="overflow-y-auto h-full">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="p-2 text-sm font-bold text-gray-500">Name</th>
                                <th className="p-2 text-sm font-bold text-gray-500">Typ</th>
                                <th className="p-2 text-sm font-bold text-gray-500 text-right">Startsaldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsedData.accounts.map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-50">
                                    <td className="p-2 text-sm font-bold">{row.name}</td>
                                    <td className="p-2 text-sm">{row.type}</td>
                                    <td className="p-2 text-sm text-right text-blue-600 font-bold">€{row.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {parsedData.accounts.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Keine Konten gefunden.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )
        }
    }


    // --- RENDER ---
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-3xl p-6 relative shadow-2xl h-[85vh] flex flex-col font-['Patrick_Hand']">

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full z-10"
                >
                    <X className="w-8 h-8" />
                </button>

                <h2 className="text-3xl font-bold mb-2 text-center text-[#333]">
                    {step === 'paste' ? 'Daten Importieren' : 'Vorschau & Import'}
                </h2>
                <p className="text-center text-gray-500 mb-6 text-lg">
                    {step === 'paste'
                        ? 'Kopiere Kontoauszüge ODER strukturierte Daten (Konten, Einnahmen...) hier rein.'
                        : 'Überprüfe die erkannten Daten.'}
                </p>

                {step === 'paste' && (
                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <div className="flex justify-end">
                            <button onClick={setExampleText} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" /> Beispiel laden
                            </button>
                        </div>
                        <textarea
                            className="flex-1 w-full p-4 border-2 border-dashed border-gray-300 rounded-2xl resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-mono text-sm bg-gray-50/50"
                            placeholder={"# Konten\nGirokonto; 2500\n\n# Fixkosten\nMiete; 800\n\n# Ausgaben\n05.02.2026 -12,99 EUR..."}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                        <button
                            onClick={handleAnalyze}
                            disabled={!text.trim()}
                            className="w-full py-4 bg-black text-white rounded-2xl font-bold text-xl hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            Analysieren <ArrowRight className="w-6 h-6" />
                        </button>
                    </div>
                )}

                {step === 'preview' && parsedData && (
                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">

                        {/* Tabs */}
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button
                                onClick={() => setActiveTab('expenses')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'expenses' ? 'bg-white shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Ausgaben ({parsedData.expenses.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('income')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'income' ? 'bg-white shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Einnahmen ({parsedData.income.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('fixed')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'fixed' ? 'bg-white shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Fixkosten ({parsedData.fixedCosts.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('accounts')}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'accounts' ? 'bg-white shadow text-black' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                Konten ({parsedData.accounts.length})
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 border border-gray-100 rounded-xl overflow-hidden bg-white">
                            {renderPreviewTab()}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setStep('paste')}
                                className="px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200"
                            >
                                Zurück
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={isImporting}
                                className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-bold text-xl hover:bg-green-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-green-500/30"
                            >
                                {isImporting ? (
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                ) : (
                                    <> <Save className="w-6 h-6" /> Alles Importieren </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
