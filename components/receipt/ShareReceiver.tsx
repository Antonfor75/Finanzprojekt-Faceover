'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useReceiptScanAccess } from '@/utils/receiptScan/useReceiptScanEnabled'
import { takeSharedFiles } from '@/utils/receiptScan/shareInbox'
import { startScan } from '@/utils/receiptScan/pendingStore'
import {
    SHARE_NOT_ENABLED_MESSAGE, shareStatusMessage, withoutShareParam, type ShareStatus,
} from '@/utils/receiptScan/shareTarget'

type Props = {
    /** Was der Service Worker nach dem Teilen gemeldet hat (?share=…). */
    status: ShareStatus
    /** Scan-Ansicht für den neuen offenen Bon öffnen. */
    onOpen: (id: string) => void
    /** Fertig (Bon angelegt oder Hinweis geschlossen): Komponente wieder ausblenden. */
    onDone: () => void
}

/**
 * Nimmt einen aus einer anderen App geteilten Bon an (Web Share Target, siehe utils/receiptScan/shareTarget.ts).
 * Wird nur geladen, wenn die Seite über "Teilen" geöffnet wurde — die Startseite selbst bleibt unberührt.
 *
 * Nicht angemeldet: Die Startseite zeigt zuerst die Anmeldung, diese Komponente entsteht erst danach
 * (die Adresse behält ?share=…, die Dateien bleiben bis zu einer Stunde in IndexedDB).
 * Ohne Freischaltung: Hinweis statt Scan, die Dateien werden gelöscht.
 */
export default function ShareReceiver({ status, onOpen, onDone }: Props) {
    const access = useReceiptScanAccess()
    const started = useRef(false)
    const [error, setError] = useState<string | null>(status === 'ok' ? null : shareStatusMessage(status))

    // Adresse sofort säubern: ein Neuladen soll nichts zweimal übernehmen.
    useEffect(() => {
        window.history.replaceState(window.history.state, '', withoutShareParam(window.location.href))
    }, [])

    useEffect(() => {
        if (status !== 'ok' || access === null || started.current) return
        started.current = true
        void (async () => {
            try {
                const files = await takeSharedFiles() // leert den Speicher in jedem Fall
                if (!access) { setError(SHARE_NOT_ENABLED_MESSAGE); return }
                if (files.length === 0) { setError(shareStatusMessage('empty')); return }
                await startScan(files, onOpen)
                onDone()
            } catch (err) {
                setError(err instanceof Error ? err.message : shareStatusMessage('error'))
            }
        })()
    }, [status, access, onOpen, onDone])

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-xl px-6" role="status" aria-live="polite">
            <div className="surface w-full max-w-sm p-6 flex flex-col items-center gap-3 text-center">
                {error ? (
                    <>
                        <AlertCircle className="w-6 h-6 text-[var(--chart-neg-heavy)]" strokeWidth={1.75} />
                        <p className="text-sm text-foreground">{error}</p>
                        <button onClick={onDone} className="press mt-1 px-5 py-2.5 rounded-full text-sm font-semibold bg-primary text-primary-foreground">
                            Schließen
                        </button>
                    </>
                ) : (
                    <>
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <p className="text-sm text-foreground">Geteilter Bon wird hochgeladen …</p>
                        <p className="text-xs text-muted-foreground">Danach liest Gemini den Bon auf dem Server. Du kannst ihn gleich prüfen.</p>
                    </>
                )}
            </div>
        </div>
    )
}
