'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/utils/supabase'
import { addAccountExpense } from '@/app/actions/funAccount'
import { Account } from '@/app/types'
import { Loader2, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

export default function AddExpenseForm({ accounts = [], onRefresh }: { accounts?: Account[], onRefresh?: () => void }) {
    const formRef = useRef<HTMLFormElement>(null)
    const [loading, setLoading] = useState(false)
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [isCalendarOpen, setIsCalendarOpen] = useState(false)

    const savingsAccounts = accounts.filter(a => a.type === 'savings')
    const funAccounts = accounts.filter(a => a.type === 'fun')
    // 'budget' = normal weekly budget, otherwise the fun account id
    const [paymentSource, setPaymentSource] = useState<'budget' | number>('budget')

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
            // PAY FROM FUN ACCOUNT: budget-neutral, keeps the real category
            if (paymentSource !== 'budget') {
                const result = await addAccountExpense(paymentSource, amount, category, description, expense_date)
                if (!result.success) {
                    alert(result.error || 'Fehler beim Speichern.')
                } else {
                    formRef.current?.reset()
                    setDate(new Date())
                    setPaymentSource('budget')
                    onRefresh?.()
                }
                setLoading(false)
                return
            }

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
            className="w-full h-full flex flex-col justify-evenly gap-6 py-6"
        >
            {/* Date Picker */}
            <div className="relative w-full text-center flex justify-center">
                <input type="hidden" name="date" value={date ? format(date, 'yyyy-MM-dd') : ''} required />
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="w-full text-center border-none bg-transparent outline-none cursor-pointer font-bold text-primary flex justify-center"
                            style={{ fontSize: '3.5vh' }}
                        >
                            {date ? format(date, 'dd. MMMM yyyy', { locale: de }) : "Datum wählen"}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="center">
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

            {/* Zahlen von: Budget | Spaßkonto */}
            {funAccounts.length > 0 && (
                <div className="w-full px-4">
                    <div className="flex bg-primary/10 rounded-2xl p-1 gap-1">
                        <button
                            type="button"
                            onClick={() => setPaymentSource('budget')}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${paymentSource === 'budget' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                        >
                            Budget
                        </button>
                        {funAccounts.map(acc => (
                            <button
                                key={acc.id}
                                type="button"
                                onClick={() => setPaymentSource(acc.id)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1 ${paymentSource === acc.id ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
                            >
                                <Sparkles className="w-4 h-4" />
                                <span className="truncate">{acc.name}</span>
                            </button>
                        ))}
                    </div>
                    {paymentSource !== 'budget' && (
                        <p className="text-[10px] text-center text-muted-foreground/70 font-medium mt-2 uppercase tracking-wider">
                            Guthaben: €{Number(funAccounts.find(a => a.id === paymentSource)?.amount ?? 0).toFixed(2)} · Budget bleibt unberührt
                        </p>
                    )}
                </div>
            )}

            <div className="w-full px-4">
                <select
                    name="category"
                    className="w-full text-center border-none shadow-sm rounded-2xl py-4 bg-primary/10 outline-none focus:ring-2 focus:ring-primary appearance-none font-bold text-foreground"
                    style={{ fontSize: '2.5vh' }}
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

                    {savingsAccounts.length > 0 && paymentSource === 'budget' && (
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
                    className="w-full text-center border-none shadow-sm rounded-3xl py-4 bg-primary/10 outline-none focus:ring-2 focus:ring-primary placeholder-primary/50 font-bold text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ fontSize: '4.5vh' }}
                />
            </div>

            <div className="w-full px-4">
                <Button
                    type="submit"
                    disabled={loading}
                    className="w-full font-bold text-center bg-primary text-primary-foreground rounded-2xl py-8 flex items-center justify-center hover:opacity-90 transition-all active:scale-95 shadow-md active:shadow-none disabled:opacity-50"
                    style={{ fontSize: '3vh' }}
                >
                    {loading ? <Loader2 className="animate-spin w-10 h-10" /> : 'Eintragen'}
                </Button>
            </div>
        </form>
    )
}
