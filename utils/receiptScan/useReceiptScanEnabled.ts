'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase'
import { isDemoMode } from '@/lib/data/mode'
import { hasReceiptScan } from './access'

/**
 * Darf dieses Konto Bons scannen (Freischaltung in der Chefansicht, app_metadata.receipt_scan)?
 *
 * Kostet nichts extra: gelesen wird nur die lokale Sitzung, also keine eigene Anfrage an Supabase.
 * Eine neue Freischaltung kommt mit der nächsten Token-Erneuerung an. Die passiert spätestens
 * stündlich bzw. beim nächsten Öffnen der App, und supabase-js meldet sie über onAuthStateChange.
 * Die Server Actions prüfen ohnehin selbst und frisch.
 * Bewusst klein gehalten: steckt im Dashboard-Paket, der Scanner selbst wird erst bei Bedarf geladen.
 */
export function useReceiptScanEnabled(): boolean {
    const [enabled, setEnabled] = useState(false)
    useEffect(() => {
        if (isDemoMode()) return
        let cancelled = false
        supabase.auth.getSession().then(({ data }) => { if (!cancelled) setEnabled(hasReceiptScan(data.session?.user)) })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!cancelled) setEnabled(hasReceiptScan(session?.user))
        })
        return () => { cancelled = true; subscription.unsubscribe() }
    }, [])
    return enabled
}
