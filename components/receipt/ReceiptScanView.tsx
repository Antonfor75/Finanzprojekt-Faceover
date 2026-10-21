'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrowLeft, Camera, Loader2, Trash2, AlertCircle, ScanLine, Image as ImageIcon } from 'lucide-react'
import AgentPanel from './AgentPanel'
import ShareToggle from '@/components/sharing/ShareToggle'
import type { Expense } from '@/app/types'
import DiscardReceiptDialog from './DiscardReceiptDialog'
import { agentViewOf } from './agentView'
import { deriveFields, isActive, itemsTotal, parseAmountInput, RECEIPT_CATEGORIES, type PendingItem } from '@/utils/receiptScan/fields'
import {
    acceptPending, cancelPending, discardPending, editPending, retryPending, runningSince, startScan, usePendingReceipts,
    usePollWhileReading,
} from '@/utils/receiptScan/pendingStore'

type Props = {
    /** Welcher offene Bon angezeigt wird; null = Startbildschirm (Foto / Galerie). */
    pendingId: string | null
    onPendingChange: (id: string | null) => void
    onBack: () => void
    /** Bon gespeichert. `shareExpense` ist gesetzt, wenn er mit dem Freund geteilt werden soll (öffnet dann das Teilen-Fenster). */
    onSaved?: (shareExpense?: Expense) => void
    /** Verknüpfter Freund (geteilte Einkäufe): dann gibt es den Schalter "Mit <name> teilen". */
    friend?: { handle: string } | null
}

/**
 * Beleg-Scanner (Web): Foto/PDF → Gemini liest → kontrollieren/korrigieren → freigeben.
 * Aufbau und Texte wie components/ReceiptScanView.tsx der Handy-App; statt Texterkennung + Qwen
 * auf dem Gerät liest Gemini den Bon auf dem Server.
 *
 * Die Ansicht führt nichts selbst aus, sie zeigt nur einen offenen Bon (utils/receiptScan/pendingStore.ts).
 * Man kann sie jederzeit verlassen: Die Auswertung läuft weiter, der Bon bleibt offen, bis er
 * freigegeben oder verworfen wird. Bewusst mit Kontrollschritt: ein falscher Betrag würde sonst
 * unbemerkt ins Budget wandern.
 */
export default function ReceiptScanView({ pendingId, onPendingChange, onBack, onSaved, friend = null }: Props) {
    const rows = usePendingReceipts()
    usePollWhileReading(rows)
    const row = pendingId ? rows.find((r) => r.id === pendingId) ?? null : null
    const fields = useMemo(() => (row ? deriveFields(row) : null), [row])

    const [picking, setPicking] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [shareWithFriend, setShareWithFriend] = useState(false)
    const cameraInput = useRef<HTMLInputElement>(null)
    const galleryInput = useRef<HTMLInputElement>(null)

    // Zurück-Taste (Handy) bzw. Zurück im Browser schließt die Scan-Ansicht, statt die App zu verlassen.
    useEffect(() => {
        window.history.pushState({ scanner: true }, '')
        const onPop = () => onBack()
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /** Schließt die Ansicht und räumt den Verlaufs-Eintrag mit auf. Der Bon bleibt offen. */
    const closeView = useCallback(() => {
        if (window.history.state?.scanner) window.history.back()
        else onBack()
    }, [onBack])

    const onFiles = async (list: FileList | null) => {
        const files = list ? Array.from(list) : []
        if (cameraInput.current) cameraInput.current.value = ''
        if (galleryInput.current) galleryInput.current.value = ''
        if (files.length === 0) return
        setError(null)
        setPicking(true)
        try {
            await startScan(files, (id) => onPendingChange(id))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Scan fehlgeschlagen.')
        } finally {
            setPicking(false)
        }
    }

    const since = runningSince(row)
    const active = row ? isActive(row) : false
    const parsedAmount = fields ? parseAmountInput(fields.amount) : NaN
    const sumItems = fields ? itemsTotal(fields.items) : 0
    const mismatch = !!fields && fields.items.length > 0 && Number.isFinite(parsedAmount) && Math.abs(sumItems - parsedAmount) > 0.02

    const save = async () => {
        if (!row) return
        setSaving(true)
        setError(null)
        // Vor dem Speichern festhalten, was geteilt werden soll: danach ist der offene Bon weg.
        const toShare = friend && shareWithFriend && fields && Number.isFinite(parsedAmount) ? fields : null
        const res = await acceptPending(row.id)
        setSaving(false)
        if (!res.ok) { setError(res.error); return }
        const saved: Expense | undefined = toShare
            ? {
                id: res.expenseId,
                created_at: new Date().toISOString(),
                description: toShare.store.trim() || toShare.category,
                amount: Math.round(parsedAmount * 100) / 100,
                expense_date: toShare.date,
                category: toShare.category,
                account_id: null,
                transfer_id: null,
            }
            : undefined
        setShareWithFriend(false)
        onSaved?.(saved)
        onPendingChange(null)
        closeView()
    }

    const discard = async () => {
        if (!row) return
        await discardPending(row.id)
        onPendingChange(null)
    }

    const updateItem = (idx: number, change: Partial<PendingItem>) => {
        if (!row || !fields) return
        editPending(row.id, { items: fields.items.map((it, i) => (i === idx ? { ...it, ...change } : it)) })
    }

    const showStart = !row
    const showForm = !!row && !!fields

    return (
        <div className="h-[100dvh] w-full bg-background overflow-y-auto">
            <div className="px-5 pb-24 max-w-lg mx-auto" style={{ paddingTop: 'max(env(safe-area-inset-top), 1.5rem)' }}>

                <div className="flex items-center gap-3 mb-6">
                    <button onClick={closeView} aria-label="Zurück zur App" className="press w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted">
                        <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                    </button>
                    <h1 className="font-display text-2xl font-semibold text-foreground">Bon scannen</h1>
                    <button onClick={closeView} className="press ml-auto px-4 py-2 rounded-full text-sm font-medium bg-muted text-foreground">
                        Zurück zur App
                    </button>
                </div>

                {/* Versteckte Datei-Auswahl: "capture" öffnet am Handy direkt die Kamera. */}
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void onFiles(e.target.files) }} />
                <input ref={galleryInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files) }} />

                {showStart && picking && (
                    <div className="surface p-6 flex flex-col items-center gap-3 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <p className="text-sm text-foreground">Bon wird gelesen …</p>
                        <p className="text-xs text-muted-foreground">Du kannst die Ansicht verlassen. Die Auswertung läuft weiter, der Bon bleibt auf der Startseite offen.</p>
                    </div>
                )}

                {showStart && !picking && (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => cameraInput.current?.click()}
                            className="press w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-semibold"
                        >
                            <Camera className="w-5 h-5" strokeWidth={1.75} />
                            Bon fotografieren
                        </button>
                        <button
                            onClick={() => galleryInput.current?.click()}
                            className="press w-full flex items-center justify-center gap-2 bg-muted text-foreground py-4 rounded-xl font-semibold"
                        >
                            <ImageIcon className="w-5 h-5" strokeWidth={1.75} />
                            Bild aus der Galerie wählen
                        </button>
                        <p className="text-xs text-muted-foreground text-center px-2">
                            Digitale Bons (z. B. Kaufland, Lidl Plus) als Bild oder PDF wählen — bis zu 4 Seiten eines Bons auf einmal.
                            Der Bon wird zur Auswertung an Google Gemini geschickt; das Foto wird gelöscht, sobald du ihn speicherst oder verwirfst.
                        </p>
                    </div>
                )}

                {error && (
                    <div className="surface p-4 mt-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-[var(--chart-neg-heavy)] shrink-0 mt-0.5" strokeWidth={1.75} />
                        <p className="text-sm text-foreground">{error}</p>
                    </div>
                )}

                {showForm && row && fields && (
                    <div className="flex flex-col gap-4 mt-2">

                        <div className="flex items-center gap-2">
                            <ScanLine className="w-4 h-4 text-primary" strokeWidth={1.75} />
                            <span className="eyebrow">Beleg erkannt</span>
                        </div>

                        <AgentPanel
                            state={agentViewOf(row, since)}
                            onCancel={() => { void cancelPending(row.id) }}
                            onRetry={() => retryPending(row.id)}
                        />

                        {/* Laden */}
                        <div className="flex flex-col gap-1">
                            <input
                                type="text"
                                value={fields.store}
                                onChange={(e) => editPending(row.id, { store: e.target.value })}
                                placeholder="Laden"
                                aria-label="Laden"
                                className={`w-full px-4 py-3.5 rounded-xl bg-muted/60 outline-none text-sm text-foreground border ${fields.fromAgent.store ? 'border-primary' : 'border-transparent'}`}
                            />
                            {fields.fromAgent.store && <span className="text-[11px] text-primary px-1">vom Agenten erkannt</span>}
                        </div>

                        {/* Gesamtbetrag */}
                        <div className="surface flex flex-col items-center px-4 pt-6 pb-3">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={fields.amount}
                                onChange={(e) => editPending(row.id, { amount: e.target.value })}
                                placeholder="0,00"
                                aria-label="Gesamtbetrag"
                                className="amount w-full text-center bg-transparent border-none outline-none font-light text-foreground text-[clamp(2rem,10vw,2.75rem)]"
                            />
                            <span className="eyebrow mt-1">Gesamtbetrag</span>
                            {fields.fromAgent.amount && <span className="text-[11px] text-primary mt-1">vom Agenten erkannt</span>}
                        </div>

                        {!active && !Number.isFinite(parsedAmount) && (
                            <div className="surface p-3 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-[var(--chart-neg-heavy)] shrink-0 mt-0.5" strokeWidth={1.75} />
                                <p className="text-xs text-muted-foreground">Gesamtbetrag nicht erkannt — bitte von Hand eintragen.</p>
                            </div>
                        )}

                        {mismatch && (
                            <div className="surface p-3 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-[var(--chart-neg-heavy)] shrink-0 mt-0.5" strokeWidth={1.75} />
                                <p className="text-xs text-muted-foreground">
                                    Artikelsumme ({sumItems.toFixed(2)} €) weicht vom Gesamtbetrag ab —
                                    bitte prüfen. Gespeichert wird der Gesamtbetrag.
                                </p>
                            </div>
                        )}

                        {/* Datum + Kategorie */}
                        <div className="flex gap-3">
                            <input
                                type="date"
                                value={fields.date}
                                onChange={(e) => editPending(row.id, { date: e.target.value })}
                                aria-label="Datum"
                                className={`flex-1 min-w-0 px-4 py-3.5 rounded-xl bg-muted/60 border outline-none text-sm text-foreground ${fields.fromAgent.date ? 'border-primary' : 'border-transparent'}`}
                            />
                            <select
                                value={fields.category}
                                onChange={(e) => editPending(row.id, { category: e.target.value })}
                                aria-label="Kategorie"
                                className="flex-1 min-w-0 px-4 py-3.5 rounded-xl bg-muted/60 border border-transparent outline-none text-sm text-foreground"
                            >
                                {RECEIPT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Artikel */}
                        <div className="flex flex-col">
                            <p className="eyebrow mb-2">
                                {fields.items.length > 0 ? `${fields.items.length} Artikel${fields.fromAgent.items ? ' — vom Agenten gelesen' : ''}` : active ? 'Agent liest die Artikel …' : 'Keine Artikel erkannt'}
                            </p>
                            {fields.items.map((it, idx) => (
                                <div key={idx} className="ledger-row gap-2">
                                    {it.quantity !== 1 && <span className="text-xs text-muted-foreground shrink-0">{String(it.quantity).replace('.', ',')} ×</span>}
                                    <input
                                        value={it.nameRaw}
                                        onChange={(e) => updateItem(idx, { nameRaw: e.target.value })}
                                        aria-label="Artikelname"
                                        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-foreground"
                                    />
                                    <input
                                        defaultValue={String(it.totalPrice).replace('.', ',')}
                                        key={`${idx}-${it.totalPrice}`}
                                        onBlur={(e) => {
                                            const v = parseAmountInput(e.target.value)
                                            if (Number.isFinite(v) && v !== it.totalPrice) updateItem(idx, { totalPrice: v })
                                        }}
                                        inputMode="decimal"
                                        aria-label="Artikelpreis"
                                        className="amount w-20 text-right bg-transparent outline-none text-sm text-foreground"
                                    />
                                    <button
                                        onClick={() => editPending(row.id, { items: fields.items.filter((_, i) => i !== idx) })}
                                        className="press w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-[var(--chart-neg-heavy)]"
                                        aria-label="Artikel entfernen"
                                    >
                                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {friend && <ShareToggle handle={friend.handle} checked={shareWithFriend} onChange={setShareWithFriend} />}

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setConfirmDiscard(true)} disabled={active || saving} className="press flex-1 py-4 rounded-xl font-semibold bg-muted text-foreground disabled:opacity-60">
                                Verwerfen
                            </button>
                            <button onClick={save} disabled={saving || active} className="press flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-semibold bg-primary text-primary-foreground disabled:opacity-60">
                                {(saving || active) && <Loader2 className="w-4 h-4 animate-spin" />}
                                {active ? 'Gemini liest …' : 'Speichern'}
                            </button>
                        </div>
                        <button onClick={() => onPendingChange(null)} className="press py-3 text-sm font-medium text-muted-foreground">
                            Weiteren Bon scannen (dieser bleibt offen)
                        </button>
                    </div>
                )}
            </div>

            <DiscardReceiptDialog
                open={confirmDiscard}
                onOpenChange={setConfirmDiscard}
                summary={row && fields ? `${fields.store.trim() || 'Bon'} · ${fields.amount || '—'} € · ${fields.date}` : 'Dieser Bon'}
                onConfirm={() => { void discard() }}
            />
        </div>
    )
}
