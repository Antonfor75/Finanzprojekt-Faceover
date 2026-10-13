'use client'

import { useState, useEffect } from 'react'
import { saveEmailConnection, getEmailConnectionStatus, deleteEmailConnection, runReweSyncNow, type ConnectionStatus } from '@/lib/data/actions'

/** REWE-/Gmail-Verbindung: Status, Eingaben und Aktionen der Postfach-Anbindung.
 * Aus SettingsOverlay.tsx herausgelöst; der Zustand lebt weiter im SettingsOverlay
 * (Eingaben bleiben also wie bisher erhalten, wenn man den Bereich verlässt). */
export function useReweConnection(onUpdate?: () => void) {
    const [reweStatus, setReweStatus] = useState<ConnectionStatus | null>(null)
    const [reweEmail, setReweEmail] = useState('')
    const [reweAppPassword, setReweAppPassword] = useState('')
    const [reweBusy, setReweBusy] = useState(false)
    const [reweMessage, setReweMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
    const [reweScope, setReweScope] = useState<'today' | 'all' | 'date'>('today')
    const [reweSinceDate, setReweSinceDate] = useState('')
    const [reweSyncBusy, setReweSyncBusy] = useState(false)

    // --- REWE / Gmail-Verbindung ---
    useEffect(() => {
        getEmailConnectionStatus()
            .then((s) => {
                setReweStatus(s)
                if (s.email_address) setReweEmail(s.email_address)
                if (s.connected) {
                    if (s.import_since) {
                        setReweScope('date')
                        setReweSinceDate(new Date(s.import_since).toISOString().split('T')[0])
                    } else {
                        setReweScope('all')
                    }
                }
            })
            .catch(() => { })
    }, [])

    // Ermittelt das Import-Startdatum aus der Auswahl (null = alle Bons).
    const computeReweImportSince = (): string | null => {
        if (reweScope === 'all') return null
        if (reweScope === 'date') return reweSinceDate ? new Date(reweSinceDate).toISOString() : null
        const t = new Date()
        t.setHours(0, 0, 0, 0)
        return t.toISOString()
    }

    const handleConnectRewe = async () => {
        setReweBusy(true)
        setReweMessage(null)
        const res = await saveEmailConnection({ email: reweEmail, appPassword: reweAppPassword, importSince: computeReweImportSince() })
        setReweBusy(false)
        if (res.success) {
            setReweMessage({ type: 'success', text: 'Postfach erfolgreich verbunden!' })
            setReweAppPassword('')
            try { setReweStatus(await getEmailConnectionStatus()) } catch { }
        } else {
            setReweMessage({ type: 'error', text: res.error || 'Verbindung fehlgeschlagen.' })
        }
    }

    const handleSyncNowRewe = async () => {
        setReweSyncBusy(true)
        setReweMessage(null)
        try {
            const res = await runReweSyncNow()
            if (res.success) {
                const parts = [`${res.imported} importiert`]
                if (res.itemsImported) parts.push(`${res.itemsImported} Artikel`)
                if (res.skippedKnown) parts.push(`${res.skippedKnown} schon bekannt`)
                if (res.skippedUnrecognized) parts.push(`${res.skippedUnrecognized} nicht erkannt`)
                if (res.failed) parts.push(`${res.failed} fehlgeschlagen`)

                if (res.skippedUnrecognized) {
                    // Kein Betrag erkannt = Parser-Problem, nicht "schon importiert" — das ist ein
                    // Fehlerfall und wird deshalb rot markiert, mit den betroffenen Betreffzeilen.
                    const subjects = res.unrecognizedSubjects?.slice(0, 3).map((s) => `„${s}"`).join(', ')
                    setReweMessage({
                        type: 'error',
                        text: `Abruf fertig: ${parts.join(', ')}. Bei nicht erkannten Mails konnte kein Betrag gefunden werden${subjects ? ` (${subjects})` : ''} — bitte melden.`,
                    })
                } else {
                    setReweMessage({ type: 'success', text: `Abruf fertig: ${parts.join(', ')}.` })
                }
                // Ausgabenliste der App aktualisieren, damit neue Bons sofort sichtbar sind.
                onUpdate?.()
            } else {
                setReweMessage({ type: 'error', text: res.error || 'Abruf fehlgeschlagen.' })
            }
            try { setReweStatus(await getEmailConnectionStatus()) } catch { }
        } finally {
            setReweSyncBusy(false)
        }
    }

    const handleDisconnectRewe = async () => {
        if (!confirm('Verbindung zum Postfach wirklich trennen? Bereits importierte Ausgaben bleiben erhalten.')) return
        setReweBusy(true)
        await deleteEmailConnection()
        setReweBusy(false)
        setReweStatus({ connected: false })
        setReweAppPassword('')
        setReweMessage(null)
    }

    return {
        reweStatus,
        setReweStatus,
        reweEmail,
        setReweEmail,
        reweAppPassword,
        setReweAppPassword,
        reweBusy,
        setReweBusy,
        reweMessage,
        setReweMessage,
        reweScope,
        setReweScope,
        reweSinceDate,
        setReweSinceDate,
        reweSyncBusy,
        setReweSyncBusy,
        computeReweImportSince,
        handleConnectRewe,
        handleSyncNowRewe,
        handleDisconnectRewe,
    }
}

export type ReweConnectionState = ReturnType<typeof useReweConnection>
