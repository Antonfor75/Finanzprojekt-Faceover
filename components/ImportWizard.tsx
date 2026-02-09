'use client'

import { useState } from 'react'
import { parseBankStatement, ParsedExpense } from '@/utils/parseBankStatement'
import { bulkImportExpenses } from '@/app/actions/import'
import { X, Check, AlertCircle, ArrowRight, Save, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

export default function ImportWizard({ onClose, onImportSuccess }: { onClose: () => void, onImportSuccess: () => void }) {
    const [step, setStep] = useState<'paste' | 'preview'>('paste')
    const [text, setText] = useState('')
    const [parsedData, setParsedData] = useState<ParsedExpense[]>([])
    const [isImporting, setIsImporting] = useState(false)

    const handleAnalyze = () => {
        const _parsed = parseBankStatement(text)
        if (_parsed.length === 0) {
            alert('Keine gültigen Ausgaben im Text gefunden! (Positive Einkommen werden ignoriert)')
            return
        }
        setParsedData(_parsed)
        setStep('preview')
    }

    const handleImport = async () => {
        setIsImporting(true)
        // Convert Date objects to ISO strings for transmission
        const payload = parsedData.map(p => ({
            amount: p.amount,
            category: p.category,
            description: p.description,
            expense_date: p.date.toISOString()
        }))

        const res = await bulkImportExpenses(payload)

        setIsImporting(false)
        if (res.success) {
            alert(`${res.count} Ausgaben erfolgreich importiert!`)
            onImportSuccess()
            onClose()
        } else {
            alert('Fehler beim Import: ' + res.error)
        }
    }

    const removeRow = (index: number) => {
        const newData = [...parsedData]
        newData.splice(index, 1)
        setParsedData(newData)
    }

    // --- RENDER ---

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-3xl p-6 relative shadow-2xl h-[80vh] flex flex-col font-['Patrick_Hand']">

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full z-10"
                >
                    <X className="w-8 h-8" />
                </button>

                <h2 className="text-3xl font-bold mb-2 text-center text-[#333]">
                    {step === 'paste' ? 'Text Einfügen' : 'Vorschau & Import'}
                </h2>
                <p className="text-center text-gray-500 mb-6 text-lg">
                    {step === 'paste' ? 'Kopiere einfach deinen Kontoauszug hier rein.' : `Ich habe ${parsedData.length} Ausgaben gefunden.`}
                </p>

                {step === 'paste' && (
                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <textarea
                            className="flex-1 w-full p-4 border-2 border-dashed border-gray-300 rounded-2xl resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-mono text-sm bg-gray-50/50"
                            placeholder="Valutadatum Betrag Waehrung&#10;08.02.2026 -81,76 EUR&#10;..."
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

                {step === 'preview' && (
                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 font-bold text-gray-500 border-b">Datum</th>
                                        <th className="p-3 font-bold text-gray-500 border-b">Was?</th>
                                        <th className="p-3 font-bold text-gray-500 border-b text-right">Betrag</th>
                                        <th className="p-3 font-bold text-gray-500 border-b w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedData.map((row, idx) => (
                                        <tr key={idx} className="border-b border-gray-50 hover:bg-yellow-50/50 transition-colors group">
                                            <td className="p-3 text-lg">{format(row.date, 'dd.MM')}</td>
                                            <td className="p-3">
                                                <select
                                                    value={row.category}
                                                    onChange={(e) => {
                                                        const newData = [...parsedData]
                                                        newData[idx].category = e.target.value
                                                        setParsedData(newData)
                                                    }}
                                                    className="bg-transparent font-bold text-lg outline-none cursor-pointer hover:bg-gray-100 rounded px-1"
                                                >
                                                    <option value="Essen">Essen 🍔</option>
                                                    <option value="Miete">Miete 🏠</option>
                                                    <option value="Transport">Transport 🚌</option>
                                                    <option value="Freizeit">Freizeit 🎉</option>
                                                    <option value="Versicherung">Versicherung 🛡️</option>
                                                    <option value="Sparen">Sparen 💰</option>
                                                    <option value="Sonstiges">Sonstiges 📦</option>
                                                </select>
                                                <div className="text-xs text-gray-400">{row.description}</div>
                                            </td>
                                            <td className="p-3 text-right font-bold text-red-500 text-lg">
                                                -€{row.amount.toFixed(2)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => removeRow(idx)}
                                                    className="p-2 hover:bg-red-100 text-gray-300 hover:text-red-500 rounded-full transition-colors"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('paste')}
                                className="px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200"
                            >
                                Zurück
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={isImporting || parsedData.length === 0}
                                className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-bold text-xl hover:bg-green-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-green-500/30"
                            >
                                {isImporting ? (
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                ) : (
                                    <> <Save className="w-6 h-6" /> {parsedData.length} Importieren </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
