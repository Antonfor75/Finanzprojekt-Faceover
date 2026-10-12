'use client'

import { useEffect, useRef, useState } from 'react'
import { FlaskConical, ChevronDown, PlayCircle, RotateCcw, UserPlus, LogOut } from 'lucide-react'

/**
 * Schwebende „Demo“-Pille oben in der Mitte. Aufgeklappt: Tour starten,
 * Demo zurücksetzen, Konto erstellen, Demo beenden und die Rechtstexte.
 * Alle Wege aus der Demo heraus sind volle Seitenwechsel (<a>), damit der
 * Demo-Schalter nie in die echte App mitwandert.
 */
export default function DemoBanner({ onStartTour, onReset }: { onStartTour: () => void; onReset: () => void }) {
    const [open, setOpen] = useState(false)
    const [confirmReset, setConfirmReset] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const close = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
                setConfirmReset(false)
            }
        }
        document.addEventListener('pointerdown', close)
        return () => document.removeEventListener('pointerdown', close)
    }, [open])

    const item =
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/70 transition-colors text-left'

    return (
        <div
            ref={ref}
            data-tour="demo-banner"
            className="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center"
        >
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setConfirmReset(false) }}
                aria-expanded={open}
                aria-label="Demo-Menü"
                className="press flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full bg-card/80 backdrop-blur-xl border border-border shadow-sm text-xs font-semibold text-foreground"
            >
                <FlaskConical className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
                Demo
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>

            {open && (
                <div role="menu" className="mt-2 w-[min(18rem,calc(100vw-2rem))] surface p-2 shadow-xl view-enter">
                    <p className="px-3 pt-2 pb-3 text-xs text-muted-foreground leading-relaxed">
                        Das ist eine Demo mit Beispieldaten. Deine Eingaben bleiben nur in diesem Browser und
                        werden nirgends gespeichert.
                    </p>
                    <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onStartTour() }}>
                        <PlayCircle className="w-4 h-4 text-primary" strokeWidth={1.75} /> Einführung starten
                    </button>
                    {confirmReset ? (
                        <button
                            type="button"
                            role="menuitem"
                            className={`${item} text-[var(--chart-neg-heavy)]`}
                            onClick={() => { setOpen(false); setConfirmReset(false); onReset() }}
                        >
                            <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> Wirklich zurücksetzen?
                        </button>
                    ) : (
                        <button type="button" role="menuitem" className={item} onClick={() => setConfirmReset(true)}>
                            <RotateCcw className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} /> Beispieldaten zurücksetzen
                        </button>
                    )}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- bewusst voller Seitenwechsel */}
                    <a role="menuitem" href="/?signup=1" className={item}>
                        <UserPlus className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} /> Eigenes Konto erstellen
                    </a>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- bewusst voller Seitenwechsel, siehe oben */}
                    <a role="menuitem" href="/" className={item}>
                        <LogOut className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} /> Demo beenden
                    </a>
                    <div className="flex justify-center gap-3 pt-2 pb-1 text-[11px] text-muted-foreground">
                        <a href="/impressum" className="hover:text-foreground">Impressum</a>
                        <span aria-hidden>·</span>
                        <a href="/datenschutz" className="hover:text-foreground">Datenschutz</a>
                    </div>
                </div>
            )}
        </div>
    )
}
