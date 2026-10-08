'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/utils/supabase'
import { PRIVACY_VERSION } from '@/lib/legal/operator'

/**
 * Einmaliger Hinweis für Bestandsnutzer, die die aktuelle Datenschutzerklärung
 * noch nicht bestätigt haben. Die Bestätigung landet in den user_metadata —
 * dieselben Felder, die bei der Registrierung gesetzt werden.
 */
export default function PrivacyUpdateNotice() {
    const [busy, setBusy] = useState(false)
    const [hidden, setHidden] = useState(false)

    if (hidden) return null

    const accept = async () => {
        setBusy(true)
        const { error } = await supabase.auth.updateUser({
            data: { privacy_accepted_at: new Date().toISOString(), privacy_version: PRIVACY_VERSION },
        })
        if (error) console.error('Datenschutz-Bestätigung speichern:', error.message)
        // Auch bei einem Fehler nicht blockieren — der Hinweis kommt beim nächsten Start wieder.
        setHidden(true)
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="privacy-notice-title" className="surface w-full max-w-sm p-6 view-enter">
                <ShieldCheck className="w-7 h-7 text-primary mb-3" strokeWidth={1.75} />
                <h2 id="privacy-notice-title" className="font-display text-xl font-semibold tracking-tight text-foreground">
                    Datenschutzhinweise
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    Wir haben eine Datenschutzerklärung und ein Impressum ergänzt. Dort steht, welche Daten die App
                    speichert, wo sie liegen und welche Rechte du hast.
                </p>
                <div className="flex flex-col gap-2 mt-5">
                    <button
                        type="button"
                        onClick={accept}
                        disabled={busy}
                        className="press w-full flex items-center justify-center bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold text-base disabled:opacity-60"
                    >
                        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Zur Kenntnis genommen'}
                    </button>
                    <Link
                        href="/datenschutz"
                        className="w-full text-center py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                        Datenschutzerklärung lesen
                    </Link>
                </div>
            </div>
        </div>
    )
}
