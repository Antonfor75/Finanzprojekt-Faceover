'use client'

import { useState } from 'react'
import { DoveSvg } from './Dove'
import type { FriendState } from '@/utils/sharing/types'

type Request = FriendState['incoming'][number]

/**
 * Eingehende Freundschaftsanfrage als Brief (Entwurf B4): Die Taube sitzt neben dem Umschlag,
 * Antippen öffnet die Klappe, der Brief gleitet nach oben und die Knöpfe blenden ein.
 * `onAnswer` darf einen Fehlertext zurückgeben; der erscheint unter den Knöpfen.
 */
export default function FriendRequestLetter({ request, ownHandle, onAnswer }: {
    request: Request
    ownHandle?: string | null
    onAnswer: (accept: boolean) => void | string | null | Promise<void | string | null>
}) {
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const answer = async (accept: boolean) => {
        if (busy) return
        setBusy(true)
        setError(null)
        const failure = await onAnswer(accept)
        // Bei Erfolg entfernt der Aufrufer den Brief; nur ein Fehler bleibt sichtbar.
        if (failure) { setError(failure); setBusy(false) }
    }

    return (
        <div
            data-open={open}
            role="dialog"
            aria-modal="true"
            aria-label="Freundschaftsanfrage"
            className="fixed inset-0 z-[80] flex h-dvh w-screen justify-center overflow-hidden bg-background text-foreground"
        >
            <div className="relative flex h-full w-full max-w-lg flex-col items-center px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+3.5rem)]">
                <span className="text-[13px] font-semibold tracking-[0.14em] text-muted-foreground">POST FÜR DICH</span>
                <h1 className="mt-3 text-center font-display text-3xl font-extrabold leading-tight">
                    @{request.handle} hat dir <br />eine Taube geschickt
                </h1>

                <div className="env-wrap relative mt-[min(26vh,210px)] h-[190px] w-[300px] max-w-full">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        disabled={open}
                        aria-label="Brief öffnen"
                        aria-expanded={open}
                        className="absolute inset-0 z-[5] rounded-[18px] bg-transparent"
                    />
                    <div className="env-body absolute inset-0 rounded-[18px]" />
                    <div className="env-letter absolute inset-x-4 top-2.5 z-[1] h-[200px] rounded-[14px] bg-card p-[18px] shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--text-foreground)_40%,transparent)]">
                        <div className="font-display text-lg font-bold">Liebe/r @{ownHandle ?? 'du'},</div>
                        <div className="mt-2 text-[15px] leading-snug text-card-foreground">
                            ich möchte unsere Einkäufe gemeinsam teilen. Verbindest du dich mit mir?
                        </div>
                        <div className="mt-2.5 text-sm text-muted-foreground">– {request.handle}</div>
                    </div>
                    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-[18px]">
                        <div className="env-front absolute inset-x-0 bottom-0 h-[130px]" />
                    </div>
                    <div className="env-flap absolute inset-x-0 top-0 h-[120px] rounded-t-[18px]" />
                    <div className="dove-land absolute -right-5 -top-14 z-[4]">
                        <DoveSvg landed width={88} height={59} />
                    </div>
                </div>

                <p className="env-hint mt-6 text-[15px] text-muted-foreground">Tippe auf den Brief</p>

                <div className="flex-1" />
                <div className="env-acts flex w-full flex-col gap-2.5" inert={!open}>
                    {error && <p role="alert" className="px-2 text-center text-sm text-destructive">{error}</p>}
                    <button
                        type="button"
                        onClick={() => answer(true)}
                        disabled={busy}
                        className="press h-[60px] rounded-full bg-primary text-[17px] font-semibold text-primary-foreground disabled:opacity-60"
                    >
                        Annehmen &amp; verbinden
                    </button>
                    <button
                        type="button"
                        onClick={() => answer(false)}
                        disabled={busy}
                        className="press h-[52px] rounded-full border border-border bg-card text-base font-semibold text-foreground disabled:opacity-60"
                    >
                        Ablehnen
                    </button>
                </div>
            </div>
        </div>
    )
}
