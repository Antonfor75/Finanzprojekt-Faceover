'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/utils/supabase'
import { Account } from '@/app/types'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export default function AddExpenseForm({ accounts = [], onRefresh }: { accounts?: Account[], onRefresh?: () => void }) {
    const formRef = useRef<HTMLFormElement>(null)
    const [loading, setLoading] = useState(false)
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [isCalendarOpen, setIsCalendarOpen] = useState(false)

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
            let accountIdForExpense: number | null = null

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

                accountIdForExpense = accountId
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

            // Extract account ID if present (re-parse or use variable scope if possible, but simpler to parse again or reuse)
            let finalAccountId = null
            if (category.startsWith('Konto: ')) {
                // We need the ID we just used. Ideally we should have declared it outside the if block or use a let.
                // Let's refactor slightly to be cleaner
            }
            // Actually, we can just use a variable declared earlier

            const { error: insertError } = await supabase
                .from('expenses')
                .insert([
                    {
                        description,
                        amount,
                        expense_date,
                        category,
                        user_id: user.id,
                        account_id: accountIdForExpense
                    }
                ])

            if (insertError) {
                console.error('Error inserting expense:', insertError)
                alert('Fehler beim Speichern.')
            } else {
                formRef.current?.reset()
                setDate(new Date())

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
            className="w-full flex flex-col gap-4 pb-2"
        >
            {/* Amount Input — the primary action, so it leads */}
            <div className="surface flex flex-col items-center px-4 pt-6 pb-2 focus-within:border-primary/40 transition-[border-color] duration-200">
                <input
                    type="number"
                    name="amount"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                    autoFocus
                    aria-label="Betrag in Euro"
                    className="amount w-full text-center bg-transparent border-none outline-none font-light text-foreground text-5xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-muted-foreground/30"
                />
                <span className="eyebrow mt-2 mb-2">Euro</span>
            </div>

            {/* Date Picker */}
            <div className="relative w-full flex">
                <input type="hidden" name="date" value={date ? format(date, 'yyyy-MM-dd') : ''} required />
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="press flex-1 flex items-center justify-between px-4 py-3.5 rounded-xl bg-muted/60 border border-transparent transition-[background-color,border-color] duration-200 hover:bg-muted focus:bg-card focus:border-border"
                        >
                            <span className="text-xs font-medium text-muted-foreground">Datum</span>
                            <span className="amount text-sm text-foreground">
                                {date ? format(date, 'dd. MMMM yyyy', { locale: de }) : 'Datum wählen'}
                            </span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3 rounded-2xl border-border shadow-lg" align="center">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(d) => {
                                if (d) {
                                    setDate(d)
                                    setIsCalendarOpen(false)
                                }
                            }}
                            initialFocus
                            locale={de}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Category Select */}
            <div className="relative flex items-center rounded-xl bg-muted/60 border border-transparent focus-within:bg-card focus-within:border-border transition-[background-color,border-color] duration-200">
                <span className="absolute left-4 text-xs font-medium text-muted-foreground pointer-events-none">Kategorie</span>
                <select
                    name="category"
                    className="w-full text-right bg-transparent border-none py-3.5 pl-24 pr-4 outline-none appearance-none font-medium text-foreground text-sm"
                    defaultValue="Essen"
                >
                    <optgroup label="Kategorien">
                        <option value="Essen">Essen 🍔</option>
                        <option value="Schminki Schminki">Schminki Schminki 💄</option>
                        <option value="Shoppi">Shoppi 🛍️</option>
                        <option value="Freizeit">Freizeit 🎉</option>
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

            {/* Submit Button */}
            <div className="pt-2">
                <button
                    type="submit"
                    disabled={loading}
                    className="press w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-base disabled:opacity-60 transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)]"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        'Ausgabe eintragen'
                    )}
                </button>
            </div>
        </form>
    )
}
