'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { Expense, ReceiptItem } from '@/app/types'
import type { ShareItem, SharedPurchase } from '@/utils/sharing/types'
import { formatEuro } from '@/utils/sharing/display'
import { actDeleteShared, actGetSharedPurchase, actSaveShare, actUnshare } from '@/app/actions/sharing'
import { settle } from './friendLinkModel'
import ItemSplitBoard from './ItemSplitBoard'
import {
    amountsFor, buildSaveInput, deleteConfirmText, initialSplit, itemsForBoard, itemsMismatch, shareItemsFromReceipt,
    shareSheetTitle, splitFromAmountInput, splitFromItems, splitFromViewPercent, unshareConfirmText, viewPercent,
    type ShareAction, type SplitState,
} from './shareSheetModel'

type Props = {
    expense: Expense
    /** Die eigenen Bon-Artikel dieser Ausgabe (ohne weggeteilte). */
    items: ReceiptItem[]
    friend: { handle: string }
    /** Eigener Anzeigename (Kontoname); ohne Angabe "Du". */
    meName?: string
    onClose: () => void
    /** Nach Speichern, Aufheben oder Löschen: Daten neu laden. Das Fenster schließt danach selbst. */
    onSaved: () => void
}

const plain = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

/**
 * Fenster von unten zum (nachträglichen) Teilen einer Ausgabe (Entwurf C4) und, nach "Nach Artikeln", das
 * Artikel-Brett (Entwurf D1-Final). Die Entscheidungen (Beträge, Spiegelung für den Partner, Speicher-Eingabe)
 * stehen in shareSheetModel.ts; hier steckt nur Anzeige und Ablauf.
 */
export default function ShareSheet({ expense, items, friend, meName = 'Du', onClose, onSaved }: Props) {
    const titleId = useId()
    const dialogRef = useRef<HTMLDivElement>(null)
    const sharedId = expense.shared_purchase_id ?? null
    const action: ShareAction = sharedId ? 'change' : 'share'

    const [sp, setSp] = useState<SharedPurchase | null>(null)
    const [loading, setLoading] = useState(!!sharedId)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)

    const [split, setSplit] = useState<SplitState>(() => initialSplit(expense, null).split)
    const [screen, setScreen] = useState<'bar' | 'items'>('bar')
    const [boardItems, setBoardItems] = useState<ShareItem[]>([])
    const [boardReady, setBoardReady] = useState(false)
    const [amountOpen, setAmountOpen] = useState(false)
    const [typing, setTyping] = useState<{ field: 'me' | 'friend'; text: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { role, totalCents } = useMemo(() => initialSplit(expense, sp), [expense, sp])

    // Bestehende Teilung laden: Seite (creator/Partner), gespeicherter Stand und Artikelliste.
    useEffect(() => {
        if (!sharedId) return
        let cancelled = false
        settle(actGetSharedPurchase(sharedId)).then((res) => {
            if (cancelled) return
            if (!res.ok) { setLoadError(res.error); setLoading(false); return }
            const loaded = res.data
            setSp(loaded)
            setSplit(initialSplit(expense, loaded).split)
            if (loaded.mode === 'items') {
                setBoardItems(itemsForBoard(loaded, items))
                setBoardReady(true)
                setScreen('items')
            } else if (loaded.mode === 'amount') {
                setAmountOpen(true)
            }
            setLoadError(null)
            setLoading(false)
        })
        return () => { cancelled = true }
        // Nur beim Öffnen (und erneutem Versuchen) laden: expense/items sind der Stand von jetzt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sharedId, attempt])

    // Der Fokus liegt beim Öffnen im Fenster; Escape schließt.
    useEffect(() => { dialogRef.current?.focus() }, [])
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const selectableItems = sp?.mode === 'items' && sp.items.length > 0 ? sp.items : shareItemsFromReceipt(items)
    const hasItems = selectableItems.length > 0

    const meAmounts = amountsFor(totalCents, split.partnerCents, role)
    const leftPct = viewPercent(role, split)
    const dateText = (() => {
        const d = new Date(expense.expense_date || expense.created_at)
        return Number.isNaN(d.getTime()) ? '' : `${format(d, 'EEE, dd.MM.', { locale: de })} · `
    })()
    const title = shareSheetTitle(expense.description, action)

    const openItems = () => {
        if (!boardReady) {
            setBoardItems(itemsForBoard(sp, items))
            setBoardReady(true)
        }
        setError(null)
        setSplit((s) => ({ ...s, mode: 'items' }))
        setScreen('items')
    }

    const closeItems = () => {
        // Zurück zum Balken: der Stand der Artikel bleibt als fester Betrag stehen.
        setSplit({ ...splitFromItems(totalCents, boardItems), mode: 'amount' })
        setError(null)
        setScreen('bar')
    }

    const changeBoard = (next: ShareItem[]) => {
        setBoardItems(next)
        setSplit(splitFromItems(totalCents, next))
        setError(null)
    }

    const save = async () => {
        setError(null)
        const current: SplitState = screen === 'items' ? { ...splitFromItems(totalCents, boardItems) } : split
        const built = buildSaveInput(expense.id, totalCents, current, boardItems)
        if (!built.ok) { setError(built.error); return }
        setBusy(true)
        const res = await settle(actSaveShare(built.input))
        setBusy(false)
        if (!res.ok) { setError(res.error); return }
        onSaved()
        onClose()
    }

    const dissolve = async (kind: 'unshare' | 'delete') => {
        const id = sp?.id ?? sharedId
        if (!id) return
        const text = kind === 'unshare' ? unshareConfirmText(role, friend.handle) : deleteConfirmText(friend.handle)
        if (!confirm(text)) return
        setError(null)
        setBusy(true)
        const res = await settle(kind === 'unshare' ? actUnshare(id) : actDeleteShared(id))
        setBusy(false)
        if (!res.ok) { setError(res.error); return }
        onSaved()
        onClose()
    }

    const onAmountInput = (field: 'me' | 'friend', text: string) => {
        setTyping({ field, text })
        setSplit((s) => splitFromAmountInput(totalCents, role, field, text, s))
    }

    const fullScreen = screen === 'items'
    const mismatch = fullScreen ? itemsMismatch(totalCents, boardItems) : null
    const ready = !loading && !loadError

    return (
        <div className="fixed inset-0 z-[90]">
            <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-in fade-in bg-foreground/30 duration-200 motion-reduce:animate-none" />
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-lg animate-in slide-in-from-bottom-10 flex-col px-5 pt-3 shadow-2xl outline-none duration-300 motion-reduce:animate-none ${fullScreen ? 'top-0 bg-background pb-[calc(env(safe-area-inset-bottom)+1rem)]' : 'max-h-[88dvh] min-h-[28rem] overflow-y-auto rounded-t-[2rem] bg-card pb-[calc(env(safe-area-inset-bottom)+1.25rem)]'}`}
            >
                {fullScreen ? (
                    <>
                        <h2 id={titleId} className="sr-only">{title}</h2>
                        <div className="pt-[env(safe-area-inset-top)]">
                            <button type="button" onClick={closeItems} className="press -ml-2 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                                <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
                                Zurück zum Balken
                            </button>
                        </div>
                        <ItemSplitBoard
                            items={boardItems}
                            meName={meName}
                            friendName={friend.handle}
                            viewer={role}
                            onChange={changeBoard}
                            title="Nach Artikeln teilen"
                            subtitle={`${expense.description} · ${formatEuro(totalCents / 100)} · ${boardItems.length} Artikel`}
                        />
                        {mismatch && (
                            <p data-testid="items-mismatch" className="mt-2 px-1 text-[13px] text-muted-foreground">
                                Die Artikel ergeben {formatEuro(mismatch.sumCents / 100)} von {formatEuro(totalCents / 100)}. Den Rest trägt {role === 'creator' ? meName : friend.handle}.
                            </p>
                        )}
                        {error && <p role="alert" className="mt-2 px-1 text-sm text-destructive">{error}</p>}
                        <SaveButton busy={busy} onClick={save} />
                    </>
                ) : (
                    <>
                        <div aria-hidden="true" className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-border" />
                        <div className="mt-5 flex items-start justify-between gap-3">
                            <h2 id={titleId} className="font-display text-[22px] font-bold leading-tight text-foreground">{title}</h2>
                            <button type="button" onClick={onClose} aria-label="Schließen" className="press -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                                <X className="size-5" strokeWidth={1.75} />
                            </button>
                        </div>
                        <p className="mt-1 text-sm tabular-nums text-muted-foreground">{dateText}{formatEuro(totalCents / 100)}</p>

                        {loading && <p className="mt-10 text-center text-sm text-muted-foreground">Lädt …</p>}
                        {loadError && (
                            <div className="mt-10 flex flex-col items-center gap-3 text-center">
                                <p role="alert" className="text-sm text-destructive">{loadError}</p>
                                <button type="button" onClick={() => { setLoadError(null); setLoading(true); setAttempt((n) => n + 1) }} className="press h-11 rounded-full border border-border bg-card px-5 text-sm font-semibold">
                                    Erneut versuchen
                                </button>
                            </div>
                        )}

                        {ready && (
                            <>
                                <div className="relative mt-6 flex h-24 overflow-hidden rounded-3xl">
                                    <div
                                        data-testid="share-bar-me"
                                        className="flex flex-col justify-center overflow-hidden whitespace-nowrap bg-primary px-4 text-primary-foreground transition-[width] duration-100 ease-linear"
                                        style={{ width: `${leftPct}%` }}
                                    >
                                        <span className="truncate text-sm font-semibold">{meName}</span>
                                        <span data-testid="share-amount-me" className="font-display text-[22px] font-extrabold tabular-nums">{formatEuro(meAmounts.meCents / 100)}</span>
                                    </div>
                                    <div className="flex flex-1 flex-col items-end justify-center overflow-hidden whitespace-nowrap bg-partner px-4 text-background">
                                        <span className="max-w-full truncate text-sm font-semibold">{friend.handle}</span>
                                        <span data-testid="share-amount-friend" className="font-display text-[22px] font-extrabold tabular-nums">{formatEuro(meAmounts.friendCents / 100)}</span>
                                    </div>
                                    <div aria-hidden="true" className="pointer-events-none absolute bottom-3.5 top-3.5 -ml-1 w-2 rounded-full bg-card shadow-[0_2px_10px_rgba(0,0,0,0.25)]" style={{ left: `${leftPct}%` }} />
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={leftPct}
                                        aria-label="Grenze verschieben"
                                        aria-valuetext={`${meName} ${formatEuro(meAmounts.meCents / 100)}, ${friend.handle} ${formatEuro(meAmounts.friendCents / 100)}`}
                                        onChange={(e) => { setTyping(null); setSplit(splitFromViewPercent(totalCents, role, Number(e.target.value))) }}
                                        className="absolute inset-0 m-0 size-full cursor-ew-resize appearance-none bg-transparent opacity-0"
                                    />
                                </div>
                                <div className="mt-2 flex justify-between text-[13px] text-muted-foreground">
                                    <span className="tabular-nums">{leftPct} %</span>
                                    <span>Balken ziehen</span>
                                    <span className="tabular-nums">{100 - leftPct} %</span>
                                </div>

                                <div className="mt-5 flex gap-2">
                                    <button
                                        type="button"
                                        aria-pressed={amountOpen}
                                        onClick={() => { setAmountOpen((o) => !o); setTyping(null) }}
                                        className={`press h-12 flex-1 rounded-2xl border text-sm font-semibold text-foreground ${amountOpen ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
                                    >
                                        Betrag eingeben
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!hasItems}
                                        onClick={openItems}
                                        className="press h-12 flex-1 rounded-2xl border border-border bg-background text-sm font-semibold text-foreground disabled:opacity-40"
                                    >
                                        Nach Artikeln
                                    </button>
                                </div>

                                {amountOpen && (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <AmountField label={meName} tone="me" value={typing?.field === 'me' ? typing.text : plain(meAmounts.meCents)} onChange={(t) => onAmountInput('me', t)} onBlur={() => setTyping(null)} />
                                        <AmountField label={friend.handle} tone="friend" value={typing?.field === 'friend' ? typing.text : plain(meAmounts.friendCents)} onChange={(t) => onAmountInput('friend', t)} onBlur={() => setTyping(null)} />
                                    </div>
                                )}
                            </>
                        )}

                        <div className="min-h-4 flex-1" />
                        {error && <p role="alert" className="mb-2 px-1 text-sm text-destructive">{error}</p>}
                        {ready && <SaveButton busy={busy} onClick={save} />}
                        {sharedId && ready && (
                            <div className="mt-3 flex justify-center gap-6">
                                <button type="button" disabled={busy} onClick={() => dissolve('unshare')} className="press py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
                                    Teilung aufheben
                                </button>
                                <button type="button" disabled={busy} onClick={() => dissolve('delete')} className="press py-2 text-sm font-medium text-destructive disabled:opacity-50">
                                    Für beide löschen
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className="press mt-2.5 h-[58px] shrink-0 rounded-full bg-primary text-[17px] font-semibold text-primary-foreground disabled:opacity-60"
        >
            {busy ? 'Speichert …' : 'Teilung speichern'}
        </button>
    )
}

function AmountField({ label, tone, value, onChange, onBlur }: { label: string; tone: 'me' | 'friend'; value: string; onChange: (text: string) => void; onBlur: () => void }) {
    return (
        <label className={`flex flex-col gap-1 rounded-2xl border-2 bg-background px-3 py-2 ${tone === 'me' ? 'border-primary' : 'border-partner'}`}>
            <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
            <span className="flex items-baseline gap-1">
                <input
                    inputMode="decimal"
                    value={value}
                    aria-label={`Betrag ${label}`}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={onBlur}
                    className="amount min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums text-foreground outline-none"
                />
                <span className="text-sm text-muted-foreground">€</span>
            </span>
        </label>
    )
}
