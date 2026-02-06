'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/utils/supabase'
import { Account } from '@/app/types'
import { Loader2 } from 'lucide-react'

export default function AddExpenseForm({ accounts = [], onRefresh }: { accounts?: Account[], onRefresh?: () => void }) {
    const formRef = useRef<HTMLFormElement>(null)
    const [loading, setLoading] = useState(false)

    const savingsAccounts = accounts.filter(a => a.type === 'savings')

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        const formData = new FormData(e.currentTarget)

        const amountStr = formData.get('amount') as string
        const amount = parseFloat(amountStr)
        const expense_date = formData.get('date') as string
        let category = formData.get('category') as string || 'Sonstiges'
        let description = formData.get('description') as string

        // If description is empty, use category name
        if (!description) {
            description = category
        }

        if (isNaN(amount) || !expense_date) {
            setLoading(false)
            return
        }

        try {
            // CHECK IF CATEGORY IS A SAVINGS ACCOUNT
            if (category.startsWith('account:')) {
                const accountId = parseInt(category.split(':')[1])
                // Get fresh account data to check balance
                const { data: account, error: accError } = await supabase
                    .from('accounts')
                    .select('*')
                    .eq('id', accountId)
                    .single()

                if (accError || !account) {
                    alert('Konto nicht gefunden.')
                    setLoading(false)
                    return
                }

                if (account.amount < amount) {
                    alert('Nicht genügend Guthaben auf dem Sparkonto!')
                    setLoading(false)
                    return
                }

                // Deduct from Savings
                const { error: updateError } = await supabase
                    .from('accounts')
                    .update({ amount: account.amount - amount })
                    .eq('id', accountId)

                if (updateError) {
                    console.error("Error updating account:", updateError)
                    setLoading(false)
                    return
                }

                // Rewrite category for display
                category = `Konto: ${account.name}`
                description = category // Ensure description matches if it was auto-set
            }

            // Explicitly fetch user to ensure RLS compliance
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                alert('Fehler: Nicht eingeloggt')
                setLoading(false)
                return
            }

            const { error: insertError } = await supabase
                .from('expenses')
                .insert([
                    { description, amount, expense_date, category, user_id: user.id }
                ])

            if (insertError) {
                console.error('Error inserting expense:', insertError)
                alert('Fehler beim Speichern.')
            } else {
                formRef.current?.reset()
                // Reset Date to Today (since reset clears it to default)
                // Actually defaultValue is handled by React, standard reset might clear it to empty if not controlled.
                // But native reset restores defaultValues.

                // Trigger refresh
                onRefresh?.()
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="w-full h-full flex flex-col justify-evenly"
        >
            {/* Date Picker */}
            <div className="relative w-full text-center">
                <input
                    type="date"
                    name="date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    required
                    onClick={(e) => e.currentTarget.showPicker()}
                    className="w-full text-center border-none bg-transparent outline-none cursor-pointer font-bold text-gray-700 dark:text-gray-200"
                    style={{ fontSize: '2.5vh' }}
                />
            </div>

            <div className="w-full px-4">
                <select
                    name="category"
                    className="w-full text-center border-none shadow-sm rounded-xl py-2 bg-gray-50 dark:bg-gray-800/50 outline-none focus:ring-2 focus:ring-blue-400 appearance-none font-bold text-gray-900 dark:text-white"
                    style={{ fontSize: '2vh' }}
                    defaultValue="Essen"
                >
                    <optgroup label="Kategorien">
                        <option value="Essen">Essen 🍔</option>
                        <option value="Miete">Miete 🏠</option>
                        <option value="Transport">Transport 🚌</option>
                        <option value="Freizeit">Freizeit 🎉</option>
                        <option value="Versicherung">Versicherung 🛡️</option>
                        <option value="Sparen">Sparen 💰</option>
                        <option value="Sonstiges">Sonstiges 📦</option>
                    </optgroup>

                    {savingsAccounts.length > 0 && (
                        <optgroup label="Von Sparkonto zahlen">
                            {savingsAccounts.map(acc => (
                                <option key={acc.id} value={`account:${acc.id}`}>
                                    {acc.name} ({acc.amount.toFixed(2)}€)
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div>

            {/* Hidden description */}
            <input type="hidden" name="description" value="" />

            <div className="w-full px-4">
                <input
                    type="number"
                    name="amount"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="€"
                    required
                    autoFocus
                    className="w-full text-center border-none shadow-sm rounded-xl py-2 bg-gray-50 dark:bg-gray-800/50 outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400 dark:placeholder-gray-600 font-bold text-gray-900 dark:text-white"
                    style={{ fontSize: '3vh' }}
                />
            </div>

            <div className="w-full px-4">
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full font-bold text-center bg-black text-white rounded-xl py-3 flex items-center justify-center hover:bg-gray-800 transition-all active:scale-95 shadow-md active:shadow-none disabled:opacity-50"
                    style={{ fontSize: '2.5vh' }}
                >
                    {loading ? <Loader2 className="animate-spin w-8 h-8" /> : 'Eintragen'}
                </button>
            </div>
        </form>
    )
}
