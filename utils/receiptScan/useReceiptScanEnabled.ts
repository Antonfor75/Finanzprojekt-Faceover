'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase'
import { isDemoMode } from '@/lib/data/mode'
import { hasReceiptScan } from './access'

/**
 * Darf dieses Konto Bons scannen (Freischaltung in der Chefansicht, app_metadata.receipt_scan)?
 *
 * Konten ohne Freischaltung kostet das nichts: gelesen wird nur die lokale Sitzung, keine Anfrage.
 * Sagt die Sitzung "freigeschaltet", fragt die App einmal frisch beim Server nach — so verschwindet
 * die Oberfläche nach dem Ausschalten in der Chefansicht beim nächsten Öffnen sofort (die Sitzung
 * selbst erfährt davon erst mit der nächsten Token-Erneuerung, bis zu 1 Stunde später).
 * Eine neue Freischaltung kommt mit der nächsten Token-Erneuerung an (onAuthStateChange).
 * Bewusst klein gehalten: steckt im Dashboard-Paket, der Scanner selbst wird erst bei Bedarf geladen.
 */
export function useReceiptScanEnabled(): boolean {
    return useReceiptScanAccess() === true
}

/**
 * Wie useReceiptScanEnabled, unterscheidet aber "noch nicht bekannt" (null) von "nicht freigeschaltet"
 * (false) — nötig, wenn man auf die Antwort warten muss (z. B. beim Empfangen eines geteilten Bons).
 */
export function useReceiptScanAccess(): boolean | null {
    const [enabled, setEnabled] = useState<boolean | null>(() => (isDemoMode() ? false : null))
    useEffect(() => {
        if (isDemoMode()) return
        let cancelled = false
        const apply = (user: Parameters<typeof hasReceiptScan>[0]) => {
            if (cancelled) return
            const fromSession = hasReceiptScan(user)
            setEnabled(fromSession)
            if (fromSession) confirmWithServer().then((ok) => { if (!cancelled && !ok) setEnabled(false) })
        }
        supabase.auth.getSession().then(({ data }) => apply(data.session?.user))
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return
            confirmed = null // neuer Stand vom Auth-Server → beim nächsten Mal wieder frisch nachfragen
            apply(session?.user)
        })
        return () => { cancelled = true; subscription.unsubscribe() }
    }, [])
    return enabled
}

/** Einmal pro Seitenaufruf beim Server nachfragen (nur für Konten, deren Sitzung "freigeschaltet" sagt). */
let confirmed: Promise<boolean> | null = null
function confirmWithServer(): Promise<boolean> {
    confirmed ??= import('@/app/actions/receiptScan')
        .then((m) => m.getReceiptScanAccess())
        .catch(() => true) // offline o. Ä.: Sitzung gilt, die Server Actions prüfen ohnehin selbst
    return confirmed
}
