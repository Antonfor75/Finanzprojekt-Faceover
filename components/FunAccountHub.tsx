'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowLeft, Plus, Loader2, ChevronDown, ChevronUp, Pencil, Check, X, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/utils/supabase'
import {
    getOrCreateFunAccountV2,
    renameFunAccountV2,
    setFunAccountForesight,
    createFunGroup,
    addFunGroupExpense,
    addFunIncomeEntry,
    updateFunGroupExpense,
    updateFunIncomeEntry,
    deleteFunGroupExpense,
    deleteFunIncomeEntry,
} from '@/app/actions/funGroups'
import { FunAccountV2, FunGroup, FunGroupExpense, FunIncomeEntry } from '@/app/types'
import { classifyBucket, calculateFunAccountSaldo, Bucket } from '@/utils/funAccountGroups'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Calendar } from '@/components/ui/calendar'
import type { DateRange } from 'react-day-picker'

const BUCKET_LABEL: Record<Bucket, string> = {
    aktuell: 'Aktuell',
    zukuenftig: 'Zukünftig',
    vergangen: 'Vergangen',
}

export default function FunAccountHub({
    onBack,
    onUpdate,
}: {
    onBack: () => void
    onUpdate?: () => void
}) {
    const [account, setAccount] = useState<FunAccountV2 | null>(null)
    const [groups, setGroups] = useState<FunGroup[]>([])
    const [expenses, setExpenses] = useState<FunGroupExpense[]>([])
    const [income, setIncome] = useState<FunIncomeEntry[]>([])
    const [loading, setLoading] = useState(true)

    const [nameDraft, setNameDraft] = useState('')
    const [editingName, setEditingName] = useState(false)

    const [expanded, setExpanded] = useState<Record<Bucket, boolean>>({
        aktuell: true,
        zukuenftig: false,
        vergangen: false,
    })

    const [entryDialog, setEntryDialog] = useState<'expense' | 'income' | null>(null)
    const [groupDialog, setGroupDialog] = useState(false)
    // null = neuer Eintrag, sonst id des Eintrags, der bearbeitet wird
    const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
    // Antippen eines Gruppen-Chips filtert beide Listen auf diese Gruppe
    const [groupFilter, setGroupFilter] = useState<number | null>(null)

    const [entryAmount, setEntryAmount] = useState('')
    const [entryDescription, setEntryDescription] = useState('')
    const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [entryGroupId, setEntryGroupId] = useState<string>('none')
    const [saving, setSaving] = useState(false)

    const [groupName, setGroupName] = useState('')
    // Ein Klick = Zeitpunkt (from), zweiter Klick = Zeitraum (from–to)
    const [groupRange, setGroupRange] = useState<DateRange | undefined>(undefined)

    const loadAll = useCallback(async (accountId: number) => {
        const [{ data: groupData }, { data: expenseData }, { data: incomeData }] = await Promise.all([
            supabase.from('fun_groups').select('*').eq('fun_account_id', accountId).order('start_date', { ascending: true }),
            supabase.from('fun_group_expenses').select('*').eq('fun_account_id', accountId).order('expense_date', { ascending: false }),
            supabase.from('fun_income_entries').select('*').eq('fun_account_id', accountId).order('income_date', { ascending: false }),
        ])
        setGroups(groupData || [])
        setExpenses(expenseData || [])
        setIncome(incomeData || [])
    }, [])

    useEffect(() => {
        (async () => {
            setLoading(true)
            const result = await getOrCreateFunAccountV2()
            if (result.success && result.account) {
                setAccount(result.account)
                setNameDraft(result.account.name)
                await loadAll(result.account.id)
            }
            setLoading(false)
        })()
    }, [loadAll])

    const groupTotals = useMemo(() => {
        const totals = new Map<number, number>()
        for (const e of expenses) {
            if (e.group_id == null) continue
            totals.set(e.group_id, (totals.get(e.group_id) || 0) + Number(e.amount))
        }
        return totals
    }, [expenses])

    const saldo = useMemo(() => {
        if (!account) return 0
        return calculateFunAccountSaldo(expenses, income, account.foresight_enabled)
    }, [expenses, income, account])

    const bucketedExpenses = useMemo(() => {
        const buckets: Record<Bucket, FunGroupExpense[]> = { aktuell: [], zukuenftig: [], vergangen: [] }
        for (const e of expenses) {
            if (groupFilter !== null && e.group_id !== groupFilter) continue
            buckets[classifyBucket(e.expense_date)].push(e)
        }
        return buckets
    }, [expenses, groupFilter])

    const bucketedIncome = useMemo(() => {
        const buckets: Record<Bucket, FunIncomeEntry[]> = { aktuell: [], zukuenftig: [], vergangen: [] }
        for (const i of income) {
            if (groupFilter !== null && i.group_id !== groupFilter) continue
            buckets[classifyBucket(i.income_date)].push(i)
        }
        return buckets
    }, [income, groupFilter])

    const groupName_ = (groupId: number | null | undefined) =>
        groupId ? groups.find(g => g.id === groupId)?.name : undefined

    const handleSaveName = async () => {
        if (!account || !nameDraft.trim()) return
        const result = await renameFunAccountV2(account.id, nameDraft.trim())
        if (result.success) {
            setAccount({ ...account, name: nameDraft.trim() })
            setEditingName(false)
            onUpdate?.()
        }
    }

    const handleToggleForesight = async () => {
        if (!account) return
        const next = !account.foresight_enabled
        setAccount({ ...account, foresight_enabled: next })
        await setFunAccountForesight(account.id, next)
        onUpdate?.()
    }

    const openEntryDialog = (type: 'expense' | 'income') => {
        setEditingEntryId(null)
        setEntryAmount('')
        setEntryDescription('')
        setEntryDate(format(new Date(), 'yyyy-MM-dd'))
        setEntryGroupId('none')
        setEntryDialog(type)
    }

    const openEditDialog = (
        type: 'expense' | 'income',
        item: { id: number; amount: number; description?: string | null; group_id?: number | null },
        dateStr: string
    ) => {
        setEditingEntryId(item.id)
        setEntryAmount(String(Number(item.amount)))
        setEntryDescription(item.description || '')
        setEntryDate(dateStr)
        setEntryGroupId(item.group_id ? String(item.group_id) : 'none')
        setEntryDialog(type)
    }

    const handleSaveEntry = async () => {
        if (!account || !entryDialog) return
        const amount = parseFloat(entryAmount)
        if (isNaN(amount) || amount <= 0 || !entryDate) return
        setSaving(true)
        const groupId = entryGroupId === 'none' ? null : Number(entryGroupId)
        const result = editingEntryId !== null
            ? (entryDialog === 'expense'
                ? await updateFunGroupExpense(editingEntryId, amount, entryDescription, entryDate, groupId)
                : await updateFunIncomeEntry(editingEntryId, amount, entryDescription, entryDate, groupId))
            : (entryDialog === 'expense'
                ? await addFunGroupExpense(account.id, amount, entryDescription, entryDate, groupId)
                : await addFunIncomeEntry(account.id, amount, entryDescription, entryDate, groupId))
        setSaving(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Speichern')
            return
        }
        setEntryDialog(null)
        setEditingEntryId(null)
        await loadAll(account.id)
        onUpdate?.()
    }

    const handleDeleteEntry = async () => {
        if (!account || !entryDialog || editingEntryId === null) return
        setSaving(true)
        const result = entryDialog === 'expense'
            ? await deleteFunGroupExpense(editingEntryId)
            : await deleteFunIncomeEntry(editingEntryId)
        setSaving(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Löschen')
            return
        }
        setEntryDialog(null)
        setEditingEntryId(null)
        await loadAll(account.id)
        onUpdate?.()
    }

    const handleSaveGroup = async () => {
        if (!account || !groupName.trim() || !groupRange?.from) return
        setSaving(true)
        const startDate = format(groupRange.from, 'yyyy-MM-dd')
        // Nur ein Tag gewählt (oder to === from) → Zeitpunkt, sonst Zeitraum
        const endDate = groupRange.to && groupRange.to.getTime() !== groupRange.from.getTime()
            ? format(groupRange.to, 'yyyy-MM-dd')
            : null
        const result = await createFunGroup(account.id, groupName.trim(), startDate, endDate)
        setSaving(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Anlegen der Gruppe')
            return
        }
        setGroupDialog(false)
        setGroupName('')
        setGroupRange(undefined)
        await loadAll(account.id)
        onUpdate?.()
    }

    if (loading || !account) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
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
                    {editingName ? (
                        <div className="flex items-center gap-2 mb-2 w-full max-w-xs">
                            <Input
                                value={nameDraft}
                                onChange={e => setNameDraft(e.target.value)}
                                className="h-10 rounded-xl text-center font-semibold"
                                autoFocus
                            />
                            <Button size="icon" variant="ghost" className="rounded-full shrink-0" onClick={handleSaveName}>
                                <Check className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="rounded-full shrink-0" onClick={() => { setEditingName(false); setNameDraft(account.name) }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setEditingName(true)}
                            className="flex items-center gap-1.5 text-xs font-light uppercase tracking-widest text-muted-foreground mb-2 hover:text-foreground transition-colors"
                        >
                            {account.name}
                            <Pencil className="w-3 h-3" />
                        </button>
                    )}

                    <div className={`font-light tracking-tight leading-none text-6xl ${saldo < 0 ? 'text-[var(--chart-neg-heavy)]' : 'text-foreground'}`}>
                        {saldo < 0 ? '−' : ''}€{Math.floor(Math.abs(saldo))}
                        <span className="text-3xl text-muted-foreground/60">.{(Math.abs(saldo) % 1).toFixed(2).split('.')[1] || '00'}</span>
                    </div>

                    <button
                        onClick={handleToggleForesight}
                        className={`mt-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${account.foresight_enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
                    >
                        <span className={`w-7 h-4 rounded-full relative transition-colors ${account.foresight_enabled ? 'bg-primary' : 'bg-border'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${account.foresight_enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </span>
                        Vorausschauend
                    </button>
                </div>
            </div>

            {/* TABS */}
            <Tabs defaultValue="ausgaben" className="px-6 mt-4 flex-1">
                <TabsList className="w-full h-11 rounded-2xl bg-muted/70 p-1">
                    <TabsTrigger value="ausgaben" className="rounded-xl font-bold">Ausgaben</TabsTrigger>
                    <TabsTrigger value="einnahmen" className="rounded-xl font-bold">Einnahmen</TabsTrigger>
                </TabsList>

                <TabsContent value="ausgaben" className="mt-5">
                    <EntryList
                        buckets={bucketedExpenses}
                        expanded={expanded}
                        setExpanded={setExpanded}
                        groupName={groupName_}
                        dateField="expense_date"
                        onAdd={() => openEntryDialog('expense')}
                        onEdit={(item, dateStr) => openEditDialog('expense', item, dateStr)}
                        addLabel="Ausgabe"
                    />
                </TabsContent>

                <TabsContent value="einnahmen" className="mt-5">
                    <EntryList
                        buckets={bucketedIncome}
                        expanded={expanded}
                        setExpanded={setExpanded}
                        groupName={groupName_}
                        dateField="income_date"
                        onAdd={() => openEntryDialog('income')}
                        onEdit={(item, dateStr) => openEditDialog('income', item, dateStr)}
                        addLabel="Einnahme"
                    />
                </TabsContent>
            </Tabs>

            {/* GRUPPEN */}
            {groups.length > 0 && (
                <div className="px-6 mt-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Gruppen
                        {groupFilter !== null && (
                            <span className="ml-2 normal-case font-medium tracking-normal">· gefiltert, erneut tippen zum Aufheben</span>
                        )}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {groups.map(g => (
                            <button
                                key={g.id}
                                onClick={() => setGroupFilter(prev => prev === g.id ? null : g.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-colors ${
                                    groupFilter === g.id
                                        ? 'bg-primary text-primary-foreground border border-transparent'
                                        : 'bg-white/70 backdrop-blur-xl border border-white/60'
                                }`}
                            >
                                <span>{g.name}</span>
                                <span className={groupFilter === g.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                                    €{(groupTotals.get(g.id) || 0).toFixed(2)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="px-6 mt-4">
                <button
                    onClick={() => setGroupDialog(true)}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                    + Gruppe erstellen
                </button>
            </div>

            {/* ENTRY DIALOG */}
            <Dialog open={entryDialog !== null} onOpenChange={(open) => { if (!open) { setEntryDialog(null); setEditingEntryId(null) } }}>
                <DialogContent className="rounded-3xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {editingEntryId !== null
                                ? (entryDialog === 'expense' ? 'Ausgabe bearbeiten' : 'Einnahme bearbeiten')
                                : (entryDialog === 'expense' ? 'Neue Ausgabe' : 'Neue Einnahme')}
                        </DialogTitle>
                        <DialogDescription>
                            {entryDialog === 'expense' ? 'Auch mit einem zukünftigen Datum als geplante Ausgabe.' : 'Optional einer Gruppe zuordnen.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="Betrag (€)"
                            value={entryAmount}
                            onChange={e => setEntryAmount(e.target.value)}
                            className="h-12 rounded-2xl text-lg text-center font-bold"
                            autoFocus
                        />
                        <Input
                            placeholder="Beschreibung (optional)"
                            value={entryDescription}
                            onChange={e => setEntryDescription(e.target.value)}
                            className="h-12 rounded-2xl"
                        />
                        <DatePicker date={entryDate} setDate={setEntryDate} className="h-12 rounded-2xl" />
                        {groups.length > 0 && (
                            <select
                                value={entryGroupId}
                                onChange={e => setEntryGroupId(e.target.value)}
                                className="w-full h-12 rounded-2xl bg-muted text-center font-medium outline-none focus:ring-2 focus:ring-primary appearance-none"
                            >
                                <option value="none">Keine Gruppe</option>
                                {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        )}
                        <Button
                            onClick={handleSaveEntry}
                            disabled={saving || !entryAmount || !entryDate}
                            className="w-full h-12 rounded-2xl font-bold"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : 'Speichern'}
                        </Button>
                        {editingEntryId !== null && (
                            <Button
                                onClick={handleDeleteEntry}
                                disabled={saving}
                                variant="ghost"
                                className="w-full h-11 rounded-2xl font-bold text-[var(--chart-neg-heavy)] hover:text-[var(--chart-neg-heavy)] hover:bg-[var(--chart-neg)]/10"
                            >
                                <Trash2 className="w-4 h-4 mr-1" /> Löschen
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* GROUP DIALOG */}
            <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
                <DialogContent className="rounded-3xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Neue Gruppe</DialogTitle>
                        <DialogDescription>Z. B. &bdquo;Urlaub&ldquo; &mdash; einen Tag antippen f&uuml;r einen Zeitpunkt, zwei Tage f&uuml;r einen Zeitraum.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input
                            placeholder="Name der Gruppe"
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            className="h-12 rounded-2xl"
                            autoFocus
                        />
                        <div className="flex justify-center rounded-2xl bg-muted/40 p-1">
                            <Calendar
                                mode="range"
                                selected={groupRange}
                                onSelect={setGroupRange}
                                locale={de}
                                defaultMonth={groupRange?.from ?? new Date()}
                            />
                        </div>
                        <p className="text-xs text-center text-muted-foreground min-h-4">
                            {groupRange?.from
                                ? groupRange.to && groupRange.to.getTime() !== groupRange.from.getTime()
                                    ? `Zeitraum: ${format(groupRange.from, 'dd. MMM yyyy', { locale: de })} – ${format(groupRange.to, 'dd. MMM yyyy', { locale: de })}`
                                    : `Zeitpunkt: ${format(groupRange.from, 'dd. MMM yyyy', { locale: de })}`
                                : 'Kein Datum gewählt'}
                        </p>
                        <Button
                            onClick={handleSaveGroup}
                            disabled={saving || !groupName.trim() || !groupRange?.from}
                            className="w-full h-12 rounded-2xl font-bold"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : 'Gruppe anlegen'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function EntryList<T extends { id: number; amount: number; description?: string | null; group_id?: number | null }>({
    buckets,
    expanded,
    setExpanded,
    groupName,
    dateField,
    onAdd,
    onEdit,
    addLabel,
}: {
    buckets: Record<Bucket, T[]>
    expanded: Record<Bucket, boolean>
    setExpanded: (fn: (prev: Record<Bucket, boolean>) => Record<Bucket, boolean>) => void
    onEdit: (item: T, dateStr: string) => void
    groupName: (groupId: number | null | undefined) => string | undefined
    dateField: 'expense_date' | 'income_date'
    onAdd: () => void
    addLabel: string
}) {
    const order: Bucket[] = ['aktuell', 'zukuenftig', 'vergangen']
    const hasAny = order.some(b => buckets[b].length > 0)

    return (
        <div className="space-y-5">
            <Button
                onClick={onAdd}
                variant="secondary"
                className="w-full h-12 rounded-2xl font-bold"
            >
                <Plus className="w-4 h-4 mr-1" /> {addLabel} hinzufügen
            </Button>

            {!hasAny && (
                <p className="text-muted-foreground text-center py-8 text-sm">Noch keine Einträge.</p>
            )}

            {order.map(bucket => {
                const items = buckets[bucket]
                if (items.length === 0) return null
                const isOpen = expanded[bucket]
                return (
                    <div key={bucket} className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                        <button
                            onClick={() => setExpanded(prev => ({ ...prev, [bucket]: !prev[bucket] }))}
                            className="flex items-center justify-between w-full mb-2"
                        >
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {BUCKET_LABEL[bucket]} ({items.length})
                            </h3>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        {isOpen && (
                            <div className="space-y-2">
                                {items.map(item => {
                                    const dateStr = (item as unknown as Record<string, string>)[dateField]
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => onEdit(item, dateStr)}
                                            className="flex items-center gap-3 p-3 w-full text-left bg-card/80 rounded-2xl border border-border/50 shadow-sm transition-colors hover:bg-muted/60 active:scale-[0.99]"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm text-foreground truncate">{item.description || 'Ohne Beschreibung'}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {format(new Date(dateStr), 'dd. MMM yyyy', { locale: de })}
                                                    {groupName(item.group_id) ? ` · ${groupName(item.group_id)}` : ''}
                                                </p>
                                            </div>
                                            <p className="font-bold text-sm shrink-0">€{Number(item.amount).toFixed(2)}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
