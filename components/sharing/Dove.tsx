'use client'

import type { AnimationEvent } from 'react'

/**
 * Die Taube aus den Entwürfen A3 (fliegt mit Brief im Schnabel) und B4 (gelandet, ohne Brief).
 * Farben kommen aus den Theme-Variablen; die Bewegung steht in app/globals.css (dove-*).
 */
export function DoveSvg({ withLetter = false, landed = false, width = 64, height = 48 }: { withLetter?: boolean; landed?: boolean; width?: number; height?: number }) {
    const stroke = landed ? 1.4 : 1.6
    return (
        <svg width={width} height={height} viewBox="0 0 72 48" aria-hidden="true">
            <path
                className="fill-card stroke-foreground"
                strokeWidth={stroke}
                strokeLinejoin="round"
                d="M6 34 C10 26 22 22 34 24 C40 19 47 16 52 18 C56 19 58 22 57 24 L62 25.5 L56.5 27.5 C53 35 43 39 31 38 C22 37.5 15 37 4 41 C6 38 6 36 6 34 Z"
            />
            <g className={landed ? 'dove-wing-settle' : 'dove-wing'}>
                <path
                    className="fill-card stroke-foreground"
                    strokeWidth={stroke}
                    strokeLinejoin="round"
                    d="M22 27 C20 15 27 5 40 3 C38 11 36 19 33 26 Z"
                />
            </g>
            <circle className="fill-foreground" cx="51" cy="21" r={landed ? 1.2 : 1.3} />
            {withLetter && (
                <g transform="rotate(-10 64 30)">
                    <rect className="fill-primary/15 stroke-primary" x="57" y="25" width="14" height="10" rx="1.5" strokeWidth="1.4" />
                    <path className="stroke-primary" d="M57.5 26 L64 31 L70.5 26" fill="none" strokeWidth="1.4" />
                </g>
            )}
            {landed && <path className="stroke-primary" d="M26 38 L25 44 M32 38 L33 44" strokeWidth="1.4" strokeLinecap="round" />}
        </svg>
    )
}

/**
 * Fliegende Taube (Entwurf A3). Positioniert sich selbst oben links im nächsten
 * `relative`-Elternelement (dort sitzt der eigene Avatar), fliegt über die gestrichelte
 * Linie und dann aus dem Bild. Nach dem Flug wird `onDone` gerufen; ohne `flying` erscheint nichts.
 */
export default function Dove({ flying, path, onDone }: { flying: boolean; path: 'line'; onDone?: () => void }) {
    if (!flying) return null
    const handleEnd = (e: AnimationEvent<HTMLDivElement>) => {
        // Der Flügelschlag (Kind-Element) darf den Flug nicht beenden.
        if (e.target === e.currentTarget) onDone?.()
    }
    return (
        <div
            data-testid="dove"
            data-path={path}
            className="dove-fly pointer-events-none absolute left-1.5 top-2 z-20 h-12 w-16"
            onAnimationEnd={handleEnd}
        >
            <DoveSvg withLetter />
        </div>
    )
}
