'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Sparkles, Plus, Minus, Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { format, isSameMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/utils/supabase'
import { depositToFunAccount, addAccountExpense } from '@/app/actions/funAccount'
import { Account, Expense, AccountTransaction } from '@/app/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type HistoryEntry = {
    id: string
    date: Date
    label: string
    amount: number // positive = deposit, negative = expense
    category?: string
}

export default function FunAccountView({
    account,
    monthlyFeed,
    expenses,
    onBack,
    onUpdate
}: {
    account: Account
    monthlyFeed: number | null
    expenses: Expense[]
    onBack: () => void
    onUpdate?: () => void
}) {
    const [transactions, setTransactions] = useState<AccountTransaction[]>([])
    const [loading, setLoading] = useState(false)
    const [dialog, setDialog] = useState<'deposit' | 'expense' | null>(null)

    // Deposit form
    const [depositAmount, setDepositAmount] = useState('')
    const [depositNote, setDepositNote] = useState('')

    // Expense form
    const [expenseAmount, setExpenseAmount] = useState('')
    const [expenseCategory, setExpenseCategory] = useState('Freizeit')
    const [expenseDescription, setExpenseDescription] = useState('')

    const loadTransactions = async () => {
        const { data } = await supabase
            .from('account_transactions')
            .select('*')
            .eq('account_id', account.id)
            .order('transaction_date', { ascending: false })
        setTransactions(data || [])
    }

    useEffect(() => {
        loadTransactions()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account.id])

    const accountExpenses = useMemo(
        () => expenses.filter(e => e.account_id === account.id),
        [expenses, account.id]
    )

    // Union of deposits and expenses, newest first
    const history: HistoryEntry[] = useMemo(() => {
        const deposits: HistoryEntry[] = transactions.map(t => ({
            id: `tx-${t.id}`,
            date: new Date(t.transaction_date || t.created_at),
            label: t.note || (t.type === 'auto_deposit' ? 'Monatliche Einzahlung' : 'Einzahlung'),
            amount: Number(t.amount)
        }))
        const spent: HistoryEntry[] = accountExpenses.map(e => ({
            id: `ex-${e.id}`,
            date: new Date(e.expense_date || e.created_at),
            label: e.description || e.category || 'Ausgabe',
            amount: -Number(e.amount),
            category: e.category
        }))
        return [...deposits, ...spent].sort((a, b) => b.date.getTime() - a.date.getTime())
    }, [transactions, accountExpenses])

    const monthSummary = useMemo(() => {
        const now = new Date()
        const thisMonth = history.filter(h => isSameMonth(h.date, now))
        const income = thisMonth.filter(h => h.amount > 0).reduce((s, h) => s + h.amount, 0)
        const spent = thisMonth.filter(h => h.amount < 0).reduce((s, h) => s - h.amount, 0)
        return { income, spent }
    }, [history])

    const handleDeposit = async () => {
        const amount = parseFloat(depositAmount)
        if (isNaN(amount) || amount <= 0) return
        setLoading(true)
        const result = await depositToFunAccount(account.id, amount, depositNote || undefined)
        setLoading(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Einzahlen')
            return
        }
        setDialog(null)
        setDepositAmount('')
        setDepositNote('')
        loadTransactions()
        onUpdate?.()
    }

    const handleExpense = async () => {
        const amount = parseFloat(expenseAmount)
        if (isNaN(amount) || amount <= 0) return
        setLoading(true)
        const result = await addAccountExpense(
            account.id,
            amount,
            expenseCategory,
            expenseDescription,
            format(new Date(), 'yyyy-MM-dd')
        )
        setLoading(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Eintragen')
            return
        }
        setDialog(null)
        setExpenseAmount('')
        setExpenseDescription('')
        onUpdate?.()
    }

    return (
        <div className="fixed inset-0 bg-background z-50 overflow-y-auto animate-in slide-in-from-right duration-300 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex flex-col min-h-full pb-8 max-w-lg mx-auto w-full">
                {/* HEAD */}
                <div className="p-6 pb-2 shrink-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors px-2 py-4 -ml-2"
                    >
                        <ArrowLeft className="w-8 h-8" />
                        <span className="text-xl font-medium">Zurück</span>
                    </button>

                    <div className="flex flex-col items-center text-center">
                        <div className="p-4 bg-primary/10 rounded-2xl text-primary mb-4">
                            <Sparkles className="w-8 h-8" strokeWidth={1.5} />
                        </div>
                        <p className="text-xs font-light uppercase tracking-widest text-muted-foreground mb-2">{account.name}</p>
                        <div className="font-light tracking-tight leading-none text-6xl text-foreground">
                            €{Math.floor(account.amount)}
                            <span className="text-3xl text-muted-foreground/60">.{(account.amount % 1).toFixed(2).split('.')[1] || '00'}</span>
                        </div>
                        {monthlyFeed && monthlyFeed > 0 && (
                            <p className="text-sm text-muted-foreground mt-3 font-medium">
                                +€{monthlyFeed.toFixed(2)} automatisch pro Monat
                            </p>
                        )}
                    </div>
                </div>

                {/* ACTIONS */}
                <div className="flex gap-3 px-6 mt-6">
                    <Button
                        onClick={() => setDialog('deposit')}
                        className="flex-1 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-md hover:opacity-90 active:scale-95"
                    >
                        <Plus className="w-5 h-5 mr-1" /> Einzahlen
                    </Button>
                    <Button
                        onClick={() => setDialog('expense')}
                        variant="secondary"
                        className="flex-1 h-14 rounded-2xl font-bold text-base shadow-sm active:scale-95"
                    >
                        <Minus className="w-5 h-5 mr-1" /> Ausgeben
                    </Button>
                </div>

                {/* MONTH SUMMARY */}
                <div className="mx-6 mt-6 p-4 bg-white/70 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-sm flex justify-around text-center">
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Diesen Monat rein</p>
                        <p className="text-lg font-bold text-green-600">+€{monthSummary.income.toFixed(2)}</p>
                    </div>
                    <div className="w-px bg-border/60" />
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Diesen Monat raus</p>
                        <p className="text-lg font-bold text-primary">−€{monthSummary.spent.toFixed(2)}</p>
                    </div>
                </div>

                {/* HISTORY */}
                <div className="px-6 mt-8">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Verlauf</h3>
                    {history.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8 text-sm">Noch keine Bewegungen.</p>
                    ) : (
                        <div className="space-y-2">
                            {history.map(entry => (
                                <div key={entry.id} className="flex items-center gap-3 p-3 bg-card/80 rounded-2xl border border-border/50 shadow-sm">
                                    {entry.amount > 0 ? (
                                        <ArrowDownCircle className="w-6 h-6 text-green-500 shrink-0" strokeWidth={1.5} />
                                    ) : (
                                        <ArrowUpCircle className="w-6 h-6 text-primary shrink-0" strokeWidth={1.5} />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{entry.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(entry.date, 'dd. MMM yyyy', { locale: de })}
                                            {entry.category ? ` · ${entry.category}` : ''}
                                        </p>
                                    </div>
                                    <p className={`font-bold text-sm shrink-0 ${entry.amount > 0 ? 'text-green-600' : 'text-foreground'}`}>
                                        {entry.amount > 0 ? '+' : '−'}€{Math.abs(entry.amount).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* DEPOSIT DIALOG */}
            <Dialog open={dialog === 'deposit'} onOpenChange={(open) => !open && setDialog(null)}>
                <DialogContent className="rounded-3xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Geld einzahlen</DialogTitle>
                        <DialogDescription>Unregelmäßiges Einkommen auf „{account.name}" einzahlen.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="Betrag (€)"
                            value={depositAmount}
                            onChange={e => setDepositAmount(e.target.value)}
                            className="h-12 rounded-2xl text-lg text-center font-bold"
                            autoFocus
                        />
                        <Input
                            placeholder="Notiz (optional, z.B. Geburtstagsgeld)"
                            value={depositNote}
                            onChange={e => setDepositNote(e.target.value)}
                            className="h-12 rounded-2xl"
                        />
                        <Button
                            onClick={handleDeposit}
                            disabled={loading || !depositAmount}
                            className="w-full h-12 rounded-2xl font-bold"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Einzahlen'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* EXPENSE DIALOG */}
            <Dialog open={dialog === 'expense'} onOpenChange={(open) => !open && setDialog(null)}>
                <DialogContent className="rounded-3xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Vom Spaßkonto ausgeben</DialogTitle>
                        <DialogDescription>Guthaben: €{account.amount.toFixed(2)} — dein Wochenbudget bleibt unberührt.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <select
                            value={expenseCategory}
                            onChange={e => setExpenseCategory(e.target.value)}
                            className="w-full h-12 rounded-2xl bg-muted text-center font-bold outline-none focus:ring-2 focus:ring-primary appearance-none"
                        >
                            <option value="Essen">Essen 🍔</option>
                            <option value="Schminki Schminki">Schminki Schminki 💄</option>
                            <option value="Shoppi">Shoppi 🛍️</option>
                            <option value="Freizeit">Freizeit 🎉</option>
                            <option value="Sonstiges">Sonstiges 📦</option>
                        </select>
                        <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="Betrag (€)"
                            value={expenseAmount}
                            onChange={e => setExpenseAmount(e.target.value)}
                            className="h-12 rounded-2xl text-lg text-center font-bold"
                            autoFocus
                        />
                        <Input
                            placeholder="Beschreibung (optional)"
                            value={expenseDescription}
                            onChange={e => setExpenseDescription(e.target.value)}
                            className="h-12 rounded-2xl"
                        />
                        <Button
                            onClick={handleExpense}
                            disabled={loading || !expenseAmount}
                            className="w-full h-12 rounded-2xl font-bold"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Eintragen'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
