'use client'

import { useEffect, useState } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/utils/supabase'
import { createTransfer } from '@/app/actions/transfers'
import type { FunTarget, TransferDirection } from '@/utils/transfer'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'

type FunOption = { value: string; label: string; target: FunTarget }

const toValue = (t: FunTarget) => `${t.kind}:${t.accountId}`

/**
 * Umbuchung zwischen Girokonto und Spaßkonto — immer derselbe Betrag auf beiden Seiten
 * (Logik und Kopplung: utils/transfer.ts, app/actions/transfers.ts).
 *
 * mode "giro": Aufruf aus der Girokonto-Ansicht. Das Spaßkonto ist optional wählbar; ohne
 *              Auswahl wird nur das Girokonto bewegt.
 * mode "fun":  Aufruf aus einer Spaßkonto-Ansicht. Das Spaßkonto steht fest, die Gegenseite
 *              ist immer das Girokonto.
 *
 * Eigene Komponente mit eigenem State (nicht im Elternteil definiert), damit das Eingabefeld
 * beim Tippen nicht den Fokus verliert.
 */
export default function TransferDialog({
    open,
    onOpenChange,
    mode,
    fixedTarget,
    onDone,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    mode: 'giro' | 'fun'
    fixedTarget?: FunTarget & { name: string }
    onDone: () => void
}) {
    // Richtung immer aus Sicht des Girokontos gespeichert: from_giro = vom Girokonto weg.
    // In der Spaßkonto-Ansicht sind die Beschriftungen aus Sicht des Spaßkontos formuliert.
    const [direction, setDirection] = useState<TransferDirection>('from_giro')
    const [amount, setAmount] = useState('')
    const [reason, setReason] = useState('')
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [targetValue, setTargetValue] = useState('none')
    const [options, setOptions] = useState<FunOption[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Frischer Dialog bei jedem Öffnen; Spaßkonten nur im Girokonto-Modus laden.
    useEffect(() => {
        if (!open) return
        setDirection('from_giro')
        setAmount('')
        setReason('')
        setDate(format(new Date(), 'yyyy-MM-dd'))
        setTargetValue(fixedTarget ? toValue(fixedTarget) : 'none')
        setError(null)

        if (mode !== 'giro') return
        let cancelled = false
        ;(async () => {
            const [{ data: v2 }, { data: legacy }] = await Promise.all([
                supabase.from('fun_accounts_v2').select('id, name').maybeSingle(),
                supabase.from('accounts').select('id, name, amount').eq('type', 'fun').order('name'),
            ])
            if (cancelled) return
            const list: FunOption[] = []
            if (v2) list.push({ value: `v2:${v2.id}`, label: v2.name, target: { kind: 'v2', accountId: v2.id } })
            for (const a of legacy || []) {
                list.push({
                    value: `legacy:${a.id}`,
                    label: `${a.name} (€${Number(a.amount).toFixed(2)})`,
                    target: { kind: 'legacy', accountId: a.id },
                })
            }
            setOptions(list)
        })()
        return () => { cancelled = true }
        // fixedTarget ist ein frisches Objekt pro Render; relevant ist nur, ob der Dialog aufgeht.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, mode])

    const target: FunTarget | null =
        mode === 'fun' ? (fixedTarget ?? null) : (options.find(o => o.value === targetValue)?.target ?? null)
    const targetName =
        mode === 'fun' ? (fixedTarget?.name ?? 'Spaßkonto') : (options.find(o => o.value === targetValue)?.label.replace(/ \(€.*\)$/, '') ?? null)

    const value = parseFloat(amount.replace(',', '.'))
    const valueOk = Number.isFinite(value) && value > 0

    // Beschriftung der beiden Knöpfe je nach Sicht.
    const choices: { dir: TransferDirection; label: string }[] =
        mode === 'giro'
            ? [{ dir: 'from_giro', label: 'Abbuchen' }, { dir: 'to_giro', label: 'Hinzufügen' }]
            : [{ dir: 'to_giro', label: 'Abbuchen' }, { dir: 'from_giro', label: 'Hinzufügen' }]

    const flow = (() => {
        if (!valueOk) return null
        const eur = `€${value.toFixed(2)}`
        if (!targetName) {
            return direction === 'from_giro' ? `${eur} werden vom Girokonto abgebucht.` : `${eur} werden dem Girokonto gutgeschrieben.`
        }
        return direction === 'from_giro'
            ? `${eur} gehen vom Girokonto auf „${targetName}“.`
            : `${eur} gehen von „${targetName}“ aufs Girokonto.`
    })()

    const handleSave = async () => {
        if (!valueOk || !reason.trim() || !date) return
        setSaving(true)
        setError(null)
        const result = await createTransfer({ direction, amount: value, reason, date, target })
        setSaving(false)
        if (!result.success) {
            setError(result.error)
            return
        }
        onOpenChange(false)
        onDone()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="rounded-3xl max-w-sm max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{mode === 'giro' ? 'Girokonto: Geld buchen' : `${fixedTarget?.name ?? 'Spaßkonto'}: Geld buchen`}</DialogTitle>
                    <DialogDescription>
                        {mode === 'giro'
                            ? 'Optional mit einem Spaßkonto: dort wird genau derselbe Betrag gegengebucht.'
                            : 'Der Betrag wird auf dem Girokonto gegengebucht — immer derselbe Betrag auf beiden Seiten.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="flex bg-muted/70 rounded-2xl p-1 gap-1">
                        {choices.map(c => (
                            <button
                                key={c.dir}
                                type="button"
                                onClick={() => setDirection(c.dir)}
                                className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors ${direction === c.dir ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {/* Kein autoFocus: sonst zieht das Betragsfeld den Cursor an sich. */}
                    <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="Betrag (€)"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="h-12 rounded-2xl text-lg text-center font-bold"
                    />
                    <Input
                        placeholder="Begründung (Pflicht)"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className="h-12 rounded-2xl"
                    />
                    <DatePicker date={date} setDate={setDate} className="h-12 rounded-2xl" />

                    {mode === 'giro' && (
                        <select
                            value={targetValue}
                            onChange={e => setTargetValue(e.target.value)}
                            className="w-full h-12 rounded-2xl bg-muted text-center font-medium outline-none focus:ring-2 focus:ring-primary appearance-none"
                        >
                            <option value="none">Kein Spaßkonto</option>
                            {options.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    )}

                    {flow && (
                        <p className="flex items-center justify-center gap-1.5 text-xs text-center text-muted-foreground">
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                            {flow}
                        </p>
                    )}
                    {error && <p className="text-sm text-center text-[var(--chart-neg-heavy)]">{error}</p>}

                    <Button
                        onClick={handleSave}
                        disabled={saving || !valueOk || !reason.trim() || !date}
                        className="w-full h-12 rounded-2xl font-bold"
                    >
                        {saving ? <Loader2 className="animate-spin" /> : 'Buchen'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
