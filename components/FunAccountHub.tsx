'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowLeft, Plus, Loader2, ChevronDown, ChevronUp, ChevronRight, Pencil, Check, X, Trash2, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '@/utils/supabase'
import {
    getOrCreateFunAccountV2,
    renameFunAccountV2,
    setFunAccountForesight,
    createFunGroup,
    deleteFunGroup,
    addFunGroupExpense,
    addFunIncomeEntry,
    updateFunGroupExpense,
    updateFunIncomeEntry,
    deleteFunGroupExpense,
    deleteFunIncomeEntry,
} from '@/app/actions/funGroups'
import { FunAccountV2, FunGroup, FunGroupExpense, FunIncomeEntry } from '@/app/types'
import { classifyBucket, classifyGroupBucket, calculateFunAccountSaldo, Bucket } from '@/utils/funAccountGroups'
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

function formatGroupPeriod(g: Pick<FunGroup, 'start_date' | 'end_date'>): string {
    const start = format(new Date(g.start_date), 'dd. MMM yyyy', { locale: de })
    if (!g.end_date || g.end_date === g.start_date) return start
    return `${start} – ${format(new Date(g.end_date), 'dd. MMM yyyy', { locale: de })}`
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

    // Detailansicht einer Gruppe (Aufschlüsselung ihrer Ausgaben)
    const [openGroupId, setOpenGroupId] = useState<number | null>(null)

    const [entryDialog, setEntryDialog] = useState<'expense' | 'income' | null>(null)
    // null = neuer Eintrag, sonst id des Eintrags, der bearbeitet wird
    const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
    // Umschalter im Ausgabe-Dialog: statt Ausgabe eine Gruppe anlegen
    const [entryIsGroup, setEntryIsGroup] = useState(false)

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

    // Saldo je Gruppe = Einnahmen − Ausgaben dieser Gruppe
    const groupTotals = useMemo(() => {
        const totals = new Map<number, number>()
        for (const e of expenses) {
            if (e.group_id == null) continue
            totals.set(e.group_id, (totals.get(e.group_id) || 0) - Number(e.amount))
        }
        for (const i of income) {
            if (i.group_id == null) continue
            totals.set(i.group_id, (totals.get(i.group_id) || 0) + Number(i.amount))
        }
        return totals
    }, [expenses, income])

    const saldo = useMemo(() => {
        if (!account) return 0
        return calculateFunAccountSaldo(expenses, income, account.foresight_enabled)
    }, [expenses, income, account])

    // Hauptliste Ausgaben: nur Einträge OHNE Gruppe — gruppierte stecken in ihrer Gruppen-Zeile
    const bucketedExpenses = useMemo(() => {
        const buckets: Record<Bucket, FunGroupExpense[]> = { aktuell: [], zukuenftig: [], vergangen: [] }
        for (const e of expenses) {
            if (e.group_id != null) continue
            buckets[classifyBucket(e.expense_date)].push(e)
        }
        return buckets
    }, [expenses])

    // Gruppen als "Konto"-Zeilen, einsortiert nach ihrem Zeitraum
    const bucketedGroups = useMemo(() => {
        const buckets: Record<Bucket, FunGroup[]> = { aktuell: [], zukuenftig: [], vergangen: [] }
        for (const g of groups) buckets[classifyGroupBucket(g)].push(g)
        return buckets
    }, [groups])

    // Hauptliste Einnahmen: analog nur Einträge OHNE Gruppe
    const bucketedIncome = useMemo(() => {
        const buckets: Record<Bucket, FunIncomeEntry[]> = { aktuell: [], zukuenftig: [], vergangen: [] }
        for (const i of income) {
            if (i.group_id != null) continue
            buckets[classifyBucket(i.income_date)].push(i)
        }
        return buckets
    }, [income])

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

    const openEntryDialog = (type: 'expense' | 'income', presetGroupId?: number) => {
        setEditingEntryId(null)
        setEntryIsGroup(false)
        setEntryAmount('')
        setEntryDescription('')
        setEntryDate(format(new Date(), 'yyyy-MM-dd'))
        setEntryGroupId(presetGroupId ? String(presetGroupId) : 'none')
        setGroupName('')
        setGroupRange(undefined)
        setEntryDialog(type)
    }

    const openEditDialog = (
        type: 'expense' | 'income',
        item: { id: number; amount: number; description?: string | null; group_id?: number | null },
        dateStr: string
    ) => {
        setEditingEntryId(item.id)
        setEntryIsGroup(false)
        setEntryAmount(String(Number(item.amount)))
        setEntryDescription(item.description || '')
        setEntryDate(dateStr)
        setEntryGroupId(item.group_id ? String(item.group_id) : 'none')
        setEntryDialog(type)
    }

    const closeEntryDialog = () => {
        setEntryDialog(null)
        setEditingEntryId(null)
        setEntryIsGroup(false)
    }

    const handleSaveEntry = async () => {
        if (!account || !entryDialog) return

        // Gruppen-Modus: Name + Zeitraum anlegen statt Ausgabe
        if (entryIsGroup) {
            if (!groupName.trim() || !groupRange?.from) return
            setSaving(true)
            const startDate = format(groupRange.from, 'yyyy-MM-dd')
            const endDate = groupRange.to && groupRange.to.getTime() !== groupRange.from.getTime()
                ? format(groupRange.to, 'yyyy-MM-dd')
                : null
            const result = await createFunGroup(account.id, groupName.trim(), startDate, endDate)
            setSaving(false)
            if (!result.success) {
                alert(result.error || 'Fehler beim Anlegen der Gruppe')
                return
            }
            closeEntryDialog()
            await loadAll(account.id)
            onUpdate?.()
            return
        }

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
        closeEntryDialog()
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
        closeEntryDialog()
        await loadAll(account.id)
        onUpdate?.()
    }

    const handleDeleteGroup = async (groupId: number) => {
        if (!account) return
        if (!confirm('Gruppe löschen? Die Einträge bleiben erhalten und verlieren nur ihre Zuordnung.')) return
        setSaving(true)
        const result = await deleteFunGroup(groupId)
        setSaving(false)
        if (!result.success) {
            alert(result.error || 'Fehler beim Löschen der Gruppe')
            return
        }
        setOpenGroupId(null)
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

    // --- GRUPPEN-DETAIL: Ausgaben UND Einnahmen der Gruppe, unabhängig vom Reiter ---
    const openGroup = openGroupId !== null ? groups.find(g => g.id === openGroupId) : null
    if (openGroup) {
        type GroupRow = {
            key: string
            kind: 'expense' | 'income'
            id: number
            amount: number
            description?: string | null
            group_id?: number | null
            date: string
        }
        const groupRows: GroupRow[] = [
            ...expenses
                .filter(e => e.group_id === openGroup.id)
                .map(e => ({ key: `e-${e.id}`, kind: 'expense' as const, id: e.id, amount: Number(e.amount), description: e.description, group_id: e.group_id, date: e.expense_date })),
            ...income
                .filter(i => i.group_id === openGroup.id)
                .map(i => ({ key: `i-${i.id}`, kind: 'income' as const, id: i.id, amount: Number(i.amount), description: i.description, group_id: i.group_id, date: i.income_date })),
        ].sort((a, b) => (a.date < b.date ? 1 : -1))
        const total = groupTotals.get(openGroup.id) || 0
        return (
            <div className="flex flex-col min-h-full pb-8 max-w-lg mx-auto w-full">
                <div className="p-6 pb-2 shrink-0">
                    <button
                        onClick={() => setOpenGroupId(null)}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors px-2 py-4 -ml-2"
                    >
                        <ArrowLeft className="w-8 h-8" />
                        <span className="text-xl font-medium">Zurück</span>
                    </button>

                    <div className="flex flex-col items-center text-center">
                        <div className="p-4 bg-primary/10 rounded-2xl text-primary mb-4">
                            <Sparkles className="w-8 h-8" strokeWidth={1.5} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2.5 py-0.5 rounded-full mb-2">Konto</span>
                        <p className="text-xs font-light uppercase tracking-widest text-muted-foreground mb-2">{openGroup.name}</p>
                        <div className={`font-light tracking-tight leading-none text-6xl ${total < 0 ? 'text-[var(--chart-neg-heavy)]' : 'text-foreground'}`}>
                            {total < 0 ? '−' : ''}€{Math.floor(Math.abs(total))}
                            <span className="text-3xl text-muted-foreground/60">.{(Math.abs(total) % 1).toFixed(2).split('.')[1] || '00'}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-3">{formatGroupPeriod(openGroup)}</p>
                    </div>
                </div>

                <div className="px-6 mt-6 space-y-5">
                    <div className="flex gap-2">
                        <Button
                            onClick={() => openEntryDialog('expense', openGroup.id)}
                            variant="secondary"
                            className="flex-1 h-12 rounded-2xl font-bold"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Ausgabe
                        </Button>
                        <Button
                            onClick={() => openEntryDialog('income', openGroup.id)}
                            variant="secondary"
                            className="flex-1 h-12 rounded-2xl font-bold"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Einnahme
                        </Button>
                    </div>

                    {groupRows.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8 text-sm">Noch keine Einträge in dieser Gruppe.</p>
                    ) : (
                        <div className="space-y-2">
                            {groupRows.map(r => (
                                <button
                                    key={r.key}
                                    onClick={() => openEditDialog(r.kind, r, r.date)}
                                    className="flex items-center gap-3 p-3 w-full text-left bg-card/80 rounded-2xl border border-border/50 shadow-sm transition-colors hover:bg-muted/60 active:scale-[0.99]"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{r.description || 'Ohne Beschreibung'}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(new Date(r.date), 'dd. MMM yyyy', { locale: de })} · {r.kind === 'expense' ? 'Ausgabe' : 'Einnahme'}
                                        </p>
                                    </div>
                                    <p className={`font-bold text-sm shrink-0 ${r.kind === 'expense' ? 'text-[var(--chart-neg-heavy)]' : 'text-[var(--chart-pos)]'}`}>
                                        {r.kind === 'expense' ? '−' : '+'}€{r.amount.toFixed(2)}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={() => handleDeleteGroup(openGroup.id)}
                        disabled={saving}
                        className="w-full text-center text-xs font-semibold text-[var(--chart-neg-heavy)] hover:underline underline-offset-2 py-2"
                    >
                        Gruppe löschen
                    </button>
                </div>

                <EntryDialogView />
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
                        groupRows={bucketedGroups}
                        groupTotals={groupTotals}
                        onOpenGroup={id => setOpenGroupId(id)}
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
                        groupRows={bucketedGroups}
                        groupTotals={groupTotals}
                        onOpenGroup={id => setOpenGroupId(id)}
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

            <EntryDialogView />
        </div>
    )

    // Gemeinsamer Eintrag-/Gruppen-Dialog (in Haupt- und Detailansicht eingebunden)
    function EntryDialogView() {
        return (
            <Dialog open={entryDialog !== null} onOpenChange={(open) => { if (!open) closeEntryDialog() }}>
                <DialogContent className="rounded-3xl max-w-sm max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingEntryId !== null
                                ? (entryDialog === 'expense' ? 'Ausgabe bearbeiten' : 'Einnahme bearbeiten')
                                : entryIsGroup
                                    ? 'Neue Gruppe'
                                    : (entryDialog === 'expense' ? 'Neue Ausgabe' : 'Neue Einnahme')}
                        </DialogTitle>
                        <DialogDescription>
                            {entryIsGroup
                                ? 'Einen Tag antippen für einen Zeitpunkt, zwei Tage für einen Zeitraum.'
                                : entryDialog === 'expense'
                                    ? 'Auch mit einem zukünftigen Datum als geplante Ausgabe.'
                                    : 'Optional einer Gruppe zuordnen.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {/* Umschalter: bei neuen Einträgen in beiden Reitern */}
                        {editingEntryId === null && (
                            <button
                                onClick={() => setEntryIsGroup(v => !v)}
                                className={`w-full flex items-center justify-between px-4 h-11 rounded-2xl text-sm font-bold transition-colors ${entryIsGroup ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
                            >
                                <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Gruppe</span>
                                <span className={`w-8 h-4.5 rounded-full relative transition-colors ${entryIsGroup ? 'bg-primary' : 'bg-border'}`}>
                                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${entryIsGroup ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </span>
                            </button>
                        )}

                        {entryIsGroup ? (
                            <>
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
                            </>
                        ) : (
                            <>
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
                            </>
                        )}

                        <Button
                            onClick={handleSaveEntry}
                            disabled={saving || (entryIsGroup ? (!groupName.trim() || !groupRange?.from) : (!entryAmount || !entryDate))}
                            className="w-full h-12 rounded-2xl font-bold"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : (entryIsGroup ? 'Gruppe anlegen' : 'Speichern')}
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
        )
    }
}

function EntryList<T extends { id: number; amount: number; description?: string | null; group_id?: number | null }>({
    buckets,
    groupRows,
    groupTotals,
    onOpenGroup,
    expanded,
    setExpanded,
    groupName,
    dateField,
    onAdd,
    onEdit,
    addLabel,
}: {
    buckets: Record<Bucket, T[]>
    groupRows?: Record<Bucket, FunGroup[]>
    groupTotals?: Map<number, number>
    onOpenGroup?: (id: number) => void
    expanded: Record<Bucket, boolean>
    setExpanded: (fn: (prev: Record<Bucket, boolean>) => Record<Bucket, boolean>) => void
    onEdit: (item: T, dateStr: string) => void
    groupName: (groupId: number | null | undefined) => string | undefined
    dateField: 'expense_date' | 'income_date'
    onAdd: () => void
    addLabel: string
}) {
    const order: Bucket[] = ['aktuell', 'zukuenftig', 'vergangen']
    const hasAny = order.some(b => buckets[b].length > 0 || (groupRows?.[b].length ?? 0) > 0)

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
                const bucketGroups = groupRows?.[bucket] ?? []
                const count = items.length + bucketGroups.length
                if (count === 0) return null
                const isOpen = expanded[bucket]
                return (
                    <div key={bucket} className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                        <button
                            onClick={() => setExpanded(prev => ({ ...prev, [bucket]: !prev[bucket] }))}
                            className="flex items-center justify-between w-full mb-2"
                        >
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {BUCKET_LABEL[bucket]} ({count})
                            </h3>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        {isOpen && (
                            <div className="space-y-2">
                                {/* Gruppen zuerst — als "Konto" gekennzeichnete Zeilen */}
                                {bucketGroups.map(g => (
                                    <button
                                        key={`group-${g.id}`}
                                        onClick={() => onOpenGroup?.(g.id)}
                                        className="flex items-center gap-3 p-3 w-full text-left bg-primary/5 rounded-2xl border border-primary/20 shadow-sm transition-colors hover:bg-primary/10 active:scale-[0.99]"
                                    >
                                        <span className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                                            <Sparkles className="w-4.5 h-4.5" strokeWidth={1.75} />
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                                                {g.name}
                                                <span className="text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">Konto</span>
                                            </p>
                                            <p className="text-xs text-muted-foreground">{formatGroupPeriod(g)}</p>
                                        </div>
                                        {(() => {
                                            const gTotal = groupTotals?.get(g.id) || 0
                                            return (
                                                <p className={`font-bold text-sm shrink-0 ${gTotal < 0 ? 'text-[var(--chart-neg-heavy)]' : gTotal > 0 ? 'text-[var(--chart-pos)]' : 'text-foreground'}`}>
                                                    {gTotal < 0 ? '−' : gTotal > 0 ? '+' : ''}€{Math.abs(gTotal).toFixed(2)}
                                                </p>
                                            )
                                        })()}
                                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                                    </button>
                                ))}
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
