'use client'

import { useState } from 'react'
import { ChevronRight, FileText, ShieldCheck, UserX, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { deleteOwnAccount } from '@/app/actions/account'
import { supabase } from '@/utils/supabase'
import { isDemoMode } from '@/lib/data/mode'

const ROW =
    'group w-full flex items-center justify-between py-4 border-b border-border/60 last:border-b-0 text-left'

/**
 * Abschnitt „Rechtliches & Konto“ am Ende der Einstellungen: Links auf Impressum
 * und Datenschutz sowie „Konto löschen“. In der Demo gibt es nichts zu löschen.
 */
export default function AccountLegalSection() {
    const demo = isDemoMode()
    const [open, setOpen] = useState(false)
    const [confirmEmail, setConfirmEmail] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const close = () => {
        if (busy) return
        setOpen(false)
        setConfirmEmail('')
        setError(null)
    }

    const handleDelete = async () => {
        setBusy(true)
        setError(null)
        const result = await deleteOwnAccount(confirmEmail)
        if (!result.success) {
            setError(result.error)
            setBusy(false)
            return
        }
        await supabase.auth.signOut()
        window.location.href = '/'
    }

    return (
        <div className="flex flex-col mb-10">
            <p className="eyebrow mb-2">Rechtliches &amp; Konto</p>

            {/* Volle Seitenwechsel (<a>), damit der Demo-Schalter nicht mitwandert. */}
            <a href="/datenschutz" className={ROW}>
                <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                    Datenschutz
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            </a>
            <a href="/impressum" className={ROW}>
                <span className="flex items-center gap-3 text-base font-semibold text-foreground">
                    <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                    Impressum
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            </a>

            {!demo && (
                <button type="button" onClick={() => setOpen(true)} className={ROW}>
                    <span className="flex items-center gap-3 text-base font-semibold text-[var(--chart-neg-heavy)]">
                        <UserX className="w-4 h-4" strokeWidth={1.75} />
                        Konto löschen
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                </button>
            )}

            <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
                <DialogContent className="sm:max-w-[400px] rounded-3xl p-6 bg-card border border-border shadow-xl mx-4 max-w-[calc(100%-2rem)]">
                    <DialogHeader>
                        <DialogTitle className="font-display text-xl font-semibold tracking-tight text-foreground text-left">
                            Konto löschen?
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground text-left leading-relaxed">
                            Dein Konto wird sofort gesperrt und du wirst abgemeldet. Deine Daten (Einträge, Konten,
                            Fixkosten, Einnahmen, Bons) bleiben noch <strong className="text-foreground">30 Tage</strong> gespeichert,
                            damit sich ein Versehen beheben lässt, und werden danach endgültig gelöscht. Sichere
                            vorher bei Bedarf deine Daten über den Backup-Knopf oben in den Einstellungen.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-1.5 mt-2">
                        <label htmlFor="delete-confirm-email" className="text-xs font-medium text-muted-foreground pl-1">
                            Zur Bestätigung deine E-Mail-Adresse eingeben
                        </label>
                        <input
                            id="delete-confirm-email"
                            type="email"
                            autoComplete="off"
                            value={confirmEmail}
                            onChange={(e) => setConfirmEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-muted/60 border border-transparent text-foreground font-medium outline-none focus:bg-card focus:border-border"
                        />
                    </div>

                    {error && (
                        <p role="alert" className="text-sm font-medium text-[var(--chart-neg-heavy)] mt-2">{error}</p>
                    )}

                    <div className="flex flex-col gap-2 mt-4">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={busy || !confirmEmail.trim()}
                            className="press w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base text-white bg-[var(--chart-neg-heavy)] disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Konto löschen'}
                        </button>
                        <button
                            type="button"
                            onClick={close}
                            disabled={busy}
                            className="w-full py-3 rounded-xl font-medium text-sm text-muted-foreground hover:text-foreground"
                        >
                            Abbrechen
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
