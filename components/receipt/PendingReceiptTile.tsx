'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, ScanLine } from 'lucide-react'
import DiscardReceiptDialog from './DiscardReceiptDialog'
import { deriveFields, isActive, orderOpen, parseAmountInput } from '@/utils/receiptScan/fields'
import { acceptPending, discardPending, loadPending, runningSince, skipPending, usePendingReceipts, usePollWhileReading } from '@/utils/receiptScan/pendingStore'

type Props = {
    /** Nach dem Speichern eines Bons: Daten der Startseite neu laden. */
    onSaved: () => void
    /** Scan-Ansicht öffnen; id = diesen offenen Bon zeigen, null = neuer Scan. */
    onOpen: (id: string | null) => void
}

const fmtDay = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return y && m && d ? `${d}.${m}.${y}` : iso
}

/**
 * Kachel der Startseite für Bons, die Gemini gerade liest oder die noch nicht freigegeben sind
 * (wie components/PendingReceiptTile.tsx der Handy-App). Zeigt immer den neuesten offenen Bon mit
 * "Freigeben"; "Ignorieren" holt den nächsten nach vorn, "Verwerfen" fragt vorher nach.
 * Ein Tipp auf die Kachel öffnet die Scan-Seite zum Prüfen.
 * Ist nichts offen und nichts in Arbeit, zeigt sie gar nichts — das Scannen startet über das Plus.
 */
export default function PendingReceiptTile({ onSaved, onOpen }: Props) {
    const rows = usePendingReceipts()
    usePollWhileReading(rows)
    const [now, setNow] = useState(() => Date.now())
    const [busy, setBusy] = useState(false)
    // Fehlermeldung gehört zu genau einem Bon.
    const [error, setError] = useState<{ id: string; message: string } | null>(null)
    const [confirmDiscard, setConfirmDiscard] = useState(false)

    useEffect(() => { void loadPending() }, [])

    const open = orderOpen(rows, now)
    const running = rows.filter((r) => isActive(r, now))
    const first = open[0] ?? null

    useEffect(() => {
        if (running.length === 0) return
        const t = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(t)
    }, [running.length])

    if (first) {
        const f = deriveFields(first)
        const amount = parseAmountInput(f.amount)
        const amountOk = Number.isFinite(amount) && amount > 0
        const summary = `${f.store.trim() || 'Bon'} · ${f.amount || '—'} € · ${fmtDay(f.date)}`
        const note = first.status === 'failed' ? (first.error ?? first.message) : first.message

        const accept = async () => {
            if (!amountOk) { onOpen(first.id); return }
            setBusy(true)
            setError(null)
            const res = await acceptPending(first.id)
            setBusy(false)
            if (res.ok) onSaved()
            else setError({ id: first.id, message: res.error })
        }

        return (
            <div className="surface p-4 col-span-2 flex flex-col gap-3">
                <button onClick={() => onOpen(first.id)} className="text-left flex flex-col gap-1 press" aria-label="Bon prüfen">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <ScanLine className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                            Offener Bon{open.length > 1 ? ` · 1 von ${open.length}` : ''}
                        </p>
                        <span className="text-xs text-primary">Prüfen</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-base font-semibold text-foreground truncate">{f.store.trim() || 'Laden unbekannt'}</p>
                            <p className="text-xs text-muted-foreground">{fmtDay(f.date)}</p>
                        </div>
                        <p className={`amount text-xl shrink-0 ${amountOk ? 'text-foreground' : 'text-[var(--chart-neg-heavy)]'}`}>
                            {amountOk ? `€${f.amount}` : 'Summe fehlt'}
                        </p>
                    </div>
                </button>

                {note && (
                    <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                        {note}
                    </p>
                )}
                {error?.id === first.id && <p className="text-xs text-[var(--chart-neg-heavy)]">{error.message}</p>}

                <div className="flex gap-2">
                    <button onClick={accept} disabled={busy} className="press flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-60">
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        {amountOk ? 'Freigeben' : 'Prüfen'}
                    </button>
                    {open.length > 1 && (
                        <button onClick={() => skipPending(first.id)} disabled={busy} className="press flex-1 py-3 rounded-xl text-sm font-medium bg-muted text-foreground disabled:opacity-60">
                            Ignorieren
                        </button>
                    )}
                    <button onClick={() => setConfirmDiscard(true)} disabled={busy} className="press flex-1 py-3 rounded-xl text-sm font-medium bg-muted text-[var(--chart-neg-heavy)] disabled:opacity-60">
                        Verwerfen
                    </button>
                </div>

                {running.length > 0 && (
                    <button onClick={() => onOpen(running[0].id)} className="press text-[11px] text-muted-foreground flex items-center gap-1.5 text-left">
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" strokeWidth={2} />
                        Gemini liest {running.length === 1 ? 'einen weiteren Bon' : `${running.length} weitere Bons`} …
                    </button>
                )}

                <DiscardReceiptDialog
                    open={confirmDiscard}
                    onOpenChange={setConfirmDiscard}
                    summary={summary}
                    onConfirm={() => { void discardPending(first.id) }}
                />
            </div>
        )
    }

    if (running.length > 0) {
        const since = runningSince(running[0])
        const seconds = since ? Math.max(0, Math.round((now - since) / 1000)) : 0
        return (
            <button onClick={() => onOpen(running[0].id)} className="surface press p-4 text-left col-span-2 flex flex-col gap-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" strokeWidth={2} />
                    Gemini wertet aus{running.length > 1 ? ` · ${running.length} Bons` : ''}
                </p>
                <p className="text-sm text-foreground">Bon wird gelesen … {seconds} s</p>
                <p className="text-[11px] text-muted-foreground">Tippen, um zuzusehen — die Auswertung läuft auch im Hintergrund weiter.</p>
            </button>
        )
    }

    // Nichts offen und nichts in Arbeit: die Startseite sieht aus wie ohne Kassenbon-Scan.
    return null
}
