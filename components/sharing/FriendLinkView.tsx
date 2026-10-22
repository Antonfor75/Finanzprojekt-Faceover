'use client'

import { useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import Dove from './Dove'
import { actSetHandle, actSendFriendRequest, actCancelFriendRequest, actEndFriendship } from '@/app/actions/sharing'
import { canSendRequest, describeLink, normalizeHandleInput, settle } from './friendLinkModel'
import type { FriendState } from '@/utils/sharing/types'

const AVATAR = 'flex size-[76px] items-center justify-center rounded-full font-display text-3xl font-extrabold'

/**
 * Verknüpfen mit einem Freund (Entwurf A3): zwei Avatare auf einer gestrichelten Linie, darunter
 * Status, Suchfeld und der große Knopf. "Verbinden" schickt die Taube sofort los und die Anfrage
 * parallel an den Server; schlägt sie fehl, landet die Taube nicht, sondern der Fehler erscheint unter dem Feld.
 */
export default function FriendLinkView({ state, onChange, onBack }: {
    state: FriendState
    onChange: (state: FriendState) => void
    onBack?: () => void
}) {
    const [handleInput, setHandleInput] = useState('')
    const [friendInput, setFriendInput] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [flying, setFlying] = useState(false)
    const [confirmEnd, setConfirmEnd] = useState(false)
    // Eigenen Kontonamen ändern (geht nur, solange keine Freundschaft besteht)
    const [editingHandle, setEditingHandle] = useState(false)

    const link = describeLink(state)

    const saveHandle = async () => {
        if (busy || !canSendRequest(handleInput)) return
        setBusy(true)
        setError(null)
        const res = await settle(actSetHandle(normalizeHandleInput(handleInput)))
        setBusy(false)
        if (!res.ok) { setError(res.error); return }
        setEditingHandle(false)
        onChange({ ...state, handle: res.data })
    }

    const startEditHandle = () => {
        setHandleInput(state.handle ?? '')
        setError(null)
        setEditingHandle(true)
    }

    const connect = async () => {
        if (busy || !canSendRequest(friendInput)) return
        setBusy(true)
        setError(null)
        setFlying(true) // die Taube startet sofort, die Anfrage läuft parallel
        const res = await settle(actSendFriendRequest(normalizeHandleInput(friendInput)))
        setBusy(false)
        if (!res.ok) { setFlying(false); setError(res.error); return }
        onChange(res.data)
    }

    const cancelRequest = async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        const res = await settle(actCancelFriendRequest())
        setBusy(false)
        if (!res.ok) { setError(res.error); return }
        onChange(res.data)
    }

    const endFriendship = async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        const res = await settle(actEndFriendship())
        setBusy(false)
        setConfirmEnd(false)
        if (!res.ok) { setError(res.error); return }
        onChange(res.data)
    }

    const onMainAction = () => {
        if (link.action === 'connect') void connect()
        else if (link.action === 'cancel') void cancelRequest()
        else setConfirmEnd(true)
    }

    const header = (
        <>
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Zurück"
                    className="press absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <ArrowLeft className="size-5" strokeWidth={1.75} />
                </button>
            )}
        </>
    )

    // --- Ohne Kontoname (oder beim Ändern): den eigenen Namen wählen ---
    if (!state.handle || editingHandle) {
        return (
            <div className="fixed inset-0 z-50 flex h-dvh w-screen justify-center overflow-hidden bg-background text-foreground animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)]">
                {header}
                <div className="flex h-full w-full max-w-lg flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+4.5rem)]">
                    <h1 className="text-center font-display text-2xl font-bold">Gemeinsames Konto</h1>
                    <p className="mt-2 text-center text-[15px] text-muted-foreground">
                        {state.handle ? 'Wähle deinen neuen Kontonamen, damit dich dein Freund findet.' : 'Wähle zuerst deinen Kontonamen, damit dich dein Freund findet.'}
                    </p>

                    <div className="mt-12">
                        <label htmlFor="own-handle-input" className="mb-2 block pl-1 text-xs font-medium text-muted-foreground">Dein Kontoname</label>
                        <div className="rounded-3xl border border-border bg-card px-5">
                            <input
                                id="own-handle-input"
                                value={handleInput}
                                onChange={(e) => { setHandleInput(e.target.value); setError(null) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') void saveHandle() }}
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                maxLength={21}
                                placeholder="z. B. anton"
                                className="h-14 w-full bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground/60"
                            />
                        </div>
                        <p className="mt-2 pl-1 text-xs text-muted-foreground">3 bis 20 Zeichen: Kleinbuchstaben, Zahlen, Punkt und Unterstrich.</p>
                        {error && <p role="alert" className="mt-2 pl-1 text-sm text-destructive">{error}</p>}
                    </div>

                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={saveHandle}
                        disabled={busy || !canSendRequest(handleInput)}
                        className="press h-[60px] rounded-full bg-primary text-[17px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        Speichern
                    </button>
                    {editingHandle && (
                        <button
                            type="button"
                            onClick={() => { setEditingHandle(false); setError(null) }}
                            disabled={busy}
                            className="press mt-2.5 h-[52px] rounded-full border border-border bg-card text-base font-semibold text-foreground"
                        >
                            Abbrechen
                        </button>
                    )}
                </div>
            </div>
        )
    }

    // --- Hauptbild: zwei Avatare, Linie, Status ---
    const typed = normalizeHandleInput(friendInput)
    const partnerLabel = link.partnerHandle ?? typed
    const partnerInitial = (link.partnerHandle ?? typed).charAt(0).toUpperCase()
    const filled = link.kind !== 'none'
    const partnerClass = filled
        ? `bg-partner text-primary-foreground border-2 border-partner ${link.kind === 'pending' ? 'border-dashed partner-pulse' : 'border-solid'}`
        : 'border-2 border-dashed border-border bg-muted text-muted-foreground'

    return (
        <div className="fixed inset-0 z-50 flex h-dvh w-screen justify-center overflow-hidden bg-background text-foreground animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)]">
            {header}
            <div className="flex h-full w-full max-w-lg flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+4.5rem)]">
                <h1 className="text-center font-display text-2xl font-bold">Gemeinsames Konto</h1>
                <p className="mt-2 text-center text-[15px] text-muted-foreground">Verbinde dich mit einer Person.</p>

                <div className="relative mx-auto mt-14 h-[150px] w-[342px] max-w-full">
                    <svg viewBox="0 0 342 150" aria-hidden="true" className="absolute inset-0 h-full w-full">
                        <path d="M86 60 C140 10 202 10 256 60" fill="none" className="stroke-border" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
                    </svg>
                    <div className="absolute left-1.5 top-[22px] flex w-20 flex-col items-center gap-2">
                        <div className={`${AVATAR} bg-primary text-primary-foreground`}>{state.handle.charAt(0).toUpperCase()}</div>
                        <span data-testid="own-handle" className="max-w-full truncate font-semibold">@{state.handle}</span>
                        {!state.friend && (
                            <button type="button" data-testid="own-handle-edit" onClick={startEditHandle} className="press -mt-1 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
                                Ändern
                            </button>
                        )}
                    </div>
                    <div className="absolute right-1.5 top-[22px] flex w-20 flex-col items-center gap-2">
                        <div className={`${AVATAR} transition-colors duration-300 ${partnerClass}`}>{filled || partnerInitial ? partnerInitial : '?'}</div>
                        <span className="min-h-6 max-w-full truncate font-semibold">{partnerLabel ? `@${partnerLabel}` : ''}</span>
                    </div>
                    <Dove flying={flying} path="line" onDone={() => setFlying(false)} />
                </div>

                <div className="mt-2 flex justify-center">
                    <span aria-live="polite" className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] text-muted-foreground">{link.status}</span>
                </div>

                {link.kind === 'none' && (
                    <div className="mt-10">
                        <div className="flex items-center gap-2.5 rounded-3xl border border-border bg-card py-1.5 pl-[18px] pr-1.5">
                            <Search className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                            <label htmlFor="friend-handle-input" className="sr-only">Kontoname suchen</label>
                            <input
                                id="friend-handle-input"
                                value={friendInput}
                                onChange={(e) => { setFriendInput(e.target.value); setError(null) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') void connect() }}
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder="Kontoname deines Freundes"
                                className="h-12 min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground/60"
                            />
                        </div>
                        {error && <p role="alert" className="mt-2 pl-2 text-sm text-destructive">{error}</p>}
                    </div>
                )}
                {link.kind !== 'none' && error && <p role="alert" className="mt-6 text-center text-sm text-destructive">{error}</p>}

                <div className="flex-1" />
                <p className="mb-3.5 text-center text-[13px] text-muted-foreground">Maximal ein Freund. So bleibt jede Teilung eindeutig.</p>

                {confirmEnd ? (
                    <div className="rounded-3xl border border-border bg-card p-5">
                        <p className="font-display text-base font-bold">Verbindung wirklich trennen?</p>
                        <p className="mt-1.5 text-sm text-muted-foreground">Alle Teilungen enden. Die Ausgaben bleiben bei euch beiden als normale Ausgaben stehen.</p>
                        <div className="mt-4 flex gap-2.5">
                            <button
                                type="button"
                                onClick={() => setConfirmEnd(false)}
                                disabled={busy}
                                className="press h-12 flex-1 rounded-full border border-border bg-card font-semibold text-foreground"
                            >
                                Abbrechen
                            </button>
                            <button
                                type="button"
                                onClick={endFriendship}
                                disabled={busy}
                                className="press h-12 flex-1 rounded-full bg-destructive font-semibold text-primary-foreground disabled:opacity-60"
                            >
                                Ja, trennen
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onMainAction}
                        disabled={busy || (link.kind === 'none' && !canSendRequest(friendInput))}
                        className={`press h-[60px] rounded-full text-[17px] font-semibold disabled:opacity-50 ${
                            link.kind === 'connected' ? 'border border-border bg-card text-foreground' : 'bg-primary text-primary-foreground'
                        }`}
                    >
                        {link.actionLabel}
                    </button>
                )}
            </div>
        </div>
    )
}
