'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowRight, ArrowLeft, Hand } from 'lucide-react'
import type { TourStep } from '@/lib/demo/tourSteps'

const PAD = 8 // Abstand des Spotlights um das Ziel
const CARD_GAP = 14
const MISSING_AFTER_MS = 3000

type Rect = { top: number; left: number; width: number; height: number }

/**
 * Geführte Einführung mit Spotlight. Eigenbau statt Bibliothek, weil Schritte
 * auf echte Klicks des Nutzers warten („Tippe hier …“) und Ziele oft erst nach
 * einem Klick erscheinen (Dialoge, Unteransichten).
 *
 * Wichtig für Radix-Dialoge (das Ausgaben-Sheet ist modal): Pointer-Events an der
 * Tour werden nativ gestoppt, sonst hielte der Dialog einen Tipp auf „Weiter“ für
 * einen Klick daneben und würde sich schließen.
 */
export default function GuidedTour({
    steps,
    onClose,
}: {
    steps: TourStep[]
    onClose: (finished: boolean) => void
}) {
    const [index, setIndex] = useState(0)
    const [rect, setRect] = useState<Rect | null>(null)
    const [missing, setMissing] = useState(false)
    const [filled, setFilled] = useState(false)
    const [viewport, setViewport] = useState(() =>
        typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight })
    const rootRef = useRef<HTMLDivElement>(null)

    const step = steps[index]
    const isLast = index === steps.length - 1

    // Schrittwechsel setzt den Zustand des alten Ziels gleich mit zurück.
    const goTo = useCallback((i: number) => {
        setRect(null)
        setMissing(false)
        setFilled(false)
        setIndex(i)
    }, [])

    const next = useCallback(() => {
        if (isLast) onClose(true)
        else goTo(index + 1)
    }, [isLast, onClose, goTo, index])

    // Bei jedem Schritt: Ziel suchen (es kann erst nach einer Animation erscheinen),
    // einmal in den sichtbaren Bereich scrollen und die Position laufend nachführen.
    useEffect(() => {
        if (!step.target) return

        const startedAt = Date.now()
        let scrolled = false
        const tick = () => {
            setViewport({ w: window.innerWidth, h: window.innerHeight })
            const el = document.querySelector(step.target!) as HTMLElement | null
            const r = el?.getBoundingClientRect()
            if (el && r && r.width > 0 && r.height > 0) {
                if (!scrolled) {
                    scrolled = true
                    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
                }
                setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
                setMissing(false)
            } else {
                setRect(null)
                if (Date.now() - startedAt > MISSING_AFTER_MS) setMissing(true)
            }
        }
        tick()
        const id = window.setInterval(tick, 150)
        return () => window.clearInterval(id)
    }, [step])

    // 'click'-Schritte: weiter, sobald der Nutzer das Ziel antippt. Kurz warten,
    // damit die App ihre Ansicht zuerst öffnen kann.
    useEffect(() => {
        if (step.advance !== 'click' || !step.target) return
        const onClick = (e: MouseEvent) => {
            if ((e.target as Element | null)?.closest?.(step.target!)) window.setTimeout(next, 350)
        }
        document.addEventListener('click', onClick, true)
        return () => document.removeEventListener('click', onClick, true)
    }, [step, next])

    // 'input'-Schritte: „Weiter“ erst, wenn im Feld etwas steht.
    useEffect(() => {
        if (step.advance !== 'input' || !step.target) return
        const onInput = (e: Event) => {
            const el = e.target as HTMLInputElement | null
            if (el?.closest?.(step.target!)) setFilled(el.value.trim() !== '')
        }
        document.addEventListener('input', onInput, true)
        return () => document.removeEventListener('input', onInput, true)
    }, [step])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // Siehe Kommentar oben: modale Radix-Dialoge sollen Tour-Klicks nicht als
    // „daneben getippt“ werten.
    useEffect(() => {
        const el = rootRef.current
        if (!el) return
        const stop = (e: Event) => e.stopPropagation()
        const events = ['pointerdown', 'mousedown', 'touchstart'] as const
        events.forEach(ev => el.addEventListener(ev, stop))
        return () => events.forEach(ev => el.removeEventListener(ev, stop))
    }, [])

    if (typeof document === 'undefined') return null

    const hole = rect && !missing
        ? {
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
        }
        : null

    // Karte unter das Ziel, wenn dort genug Platz ist — sonst darüber.
    const cardWidth = Math.min(352, viewport.w - 32)
    let cardStyle: React.CSSProperties
    if (hole) {
        const spaceBelow = viewport.h - (hole.top + hole.height)
        const placeBelow = spaceBelow > 230 || spaceBelow > hole.top
        const left = Math.min(Math.max(16, hole.left + hole.width / 2 - cardWidth / 2), viewport.w - cardWidth - 16)
        cardStyle = placeBelow
            ? { top: Math.min(hole.top + hole.height + CARD_GAP, viewport.h - 200), left, width: cardWidth }
            : { bottom: Math.max(16, viewport.h - hole.top + CARD_GAP), left, width: cardWidth }
    } else {
        cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardWidth }
    }

    const waitingForTap = step.advance === 'click' && !missing
    const canGoBack = index > 0 && step.advance === 'next' && steps[index - 1].advance === 'next' && !!steps[index - 1].target === !!step.target
    const keepFocus = (e: React.MouseEvent) => e.preventDefault() // Tastatur im Betragsfeld bleibt offen

    return createPortal(
        <div ref={rootRef} className="fixed inset-0 z-[100] pointer-events-none" style={{ pointerEvents: 'none' }}>
            {/* Abdunkelung mit Aussparung */}
            {hole ? (
                <div
                    aria-hidden
                    className="fixed rounded-3xl transition-[top,left,width,height] duration-300 ease-[var(--ease-out-strong)]"
                    style={{ ...hole, boxShadow: '0 0 0 9999px rgba(15, 10, 20, 0.55)', outline: '2px solid var(--color-primary)', outlineOffset: '2px' }}
                />
            ) : (
                <div aria-hidden className="fixed inset-0" style={{ background: 'rgba(15, 10, 20, 0.55)' }} />
            )}

            {/* Klick-Sperren um die Aussparung: daneben tippen bewirkt nichts,
                das markierte Element selbst bleibt bedienbar. */}
            {hole ? (
                <>
                    <div className="fixed left-0 right-0 top-0" style={{ height: Math.max(0, hole.top), pointerEvents: 'auto' }} />
                    <div className="fixed left-0 right-0 bottom-0" style={{ top: hole.top + hole.height, pointerEvents: 'auto' }} />
                    <div className="fixed left-0" style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left), pointerEvents: 'auto' }} />
                    <div className="fixed right-0" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width, pointerEvents: 'auto' }} />
                </>
            ) : (
                <div className="fixed inset-0" style={{ pointerEvents: 'auto' }} />
            )}

            {/* Karte */}
            <div
                role="dialog"
                aria-modal="false"
                aria-labelledby="tour-title"
                className="fixed surface p-5 shadow-2xl"
                style={{ ...cardStyle, pointerEvents: 'auto' }}
            >
                <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="eyebrow">Einführung · {index + 1}/{steps.length}</p>
                    <button
                        type="button"
                        onMouseDown={keepFocus}
                        onClick={() => onClose(false)}
                        aria-label="Einführung beenden"
                        className="-mr-1 -mt-1 p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                </div>
                <div aria-live="polite">
                    <h2 id="tour-title" className="font-display text-lg font-semibold tracking-tight text-foreground">
                        {step.title}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">
                        {missing ? `${step.text} (Das Element ist gerade nicht zu sehen — du kannst einfach weitergehen.)` : step.text}
                    </p>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4">
                    {canGoBack ? (
                        <button
                            type="button"
                            onMouseDown={keepFocus}
                            onClick={() => goTo(index - 1)}
                            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground py-2"
                        >
                            <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Zurück
                        </button>
                    ) : (
                        <button
                            type="button"
                            onMouseDown={keepFocus}
                            onClick={() => onClose(false)}
                            className="text-sm font-medium text-muted-foreground hover:text-foreground py-2"
                        >
                            {index === 0 ? 'Überspringen' : 'Beenden'}
                        </button>
                    )}

                    {isLast ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onClose(true)}
                                className="text-sm font-semibold text-foreground px-3 py-2.5 rounded-xl hover:bg-muted/70"
                            >
                                Erkunden
                            </button>
                            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- voller Seitenwechsel aus der Demo */}
                            <a
                                href="/?signup=1"
                                className="press bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold"
                            >
                                Konto erstellen
                            </a>
                        </div>
                    ) : waitingForTap ? (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary py-2.5">
                            <Hand className="w-4 h-4 animate-pulse" strokeWidth={2} /> Tippe auf die Markierung
                        </span>
                    ) : (
                        <button
                            type="button"
                            onMouseDown={keepFocus}
                            onClick={next}
                            disabled={step.advance === 'input' && !filled && !missing}
                            className="press flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                        >
                            Weiter <ArrowRight className="w-4 h-4" strokeWidth={2} />
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}
