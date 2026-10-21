'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import FriendLinkView from './FriendLinkView'
import { settle } from './friendLinkModel'
import { actGetFriendState } from '@/app/actions/sharing'
import type { FriendState } from '@/utils/sharing/types'

/** Lädt den Freundschaftsstand und zeigt dann FriendLinkView (Einstieg aus den Einstellungen). */
export default function FriendLinkScreen({ onBack }: { onBack: () => void }) {
    const [state, setState] = useState<FriendState | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)

    const load = useCallback(async () => {
        const res = await settle(actGetFriendState())
        if (res.ok) { setState(res.data); setError(null) }
        else setError(res.error)
    }, [])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load()
    }, [load, attempt])

    if (state) return <FriendLinkView state={state} onChange={setState} onBack={onBack} />

    return (
        <div className="fixed inset-0 z-50 flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
            <button
                type="button"
                onClick={onBack}
                aria-label="Zurück"
                className="press absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                <ArrowLeft className="size-5" strokeWidth={1.75} />
            </button>
            {error ? (
                <>
                    <p role="alert" className="text-sm text-destructive">{error}</p>
                    <button
                        type="button"
                        onClick={() => { setError(null); setAttempt(n => n + 1) }}
                        className="press h-12 rounded-full border border-border bg-card px-6 font-semibold"
                    >
                        Erneut versuchen
                    </button>
                </>
            ) : (
                <p className="text-sm text-muted-foreground">Lädt …</p>
            )}
        </div>
    )
}
