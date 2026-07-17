'use client'

import { useEffect } from 'react'

/**
 * Schreibt die Höhe der eingeblendeten Bildschirmtastatur nach `--kb-inset`
 * und setzt `data-keyboard="open"` auf <html>.
 *
 * `interactiveWidget: resizes-content` (app/layout.tsx) erledigt das auf Android
 * bereits über dvh; iOS Safari kennt das Feld nicht und schiebt stattdessen das
 * Layout-Viewport unter die Tastatur — dort ist visualViewport die einzige Quelle.
 */
export default function KeyboardInset() {
    useEffect(() => {
        const vv = window.visualViewport
        if (!vv) return

        const root = document.documentElement

        const sync = () => {
            // Sichtbar verdeckter Bereich am unteren Rand = Tastatur (+ ggf. UI-Leisten).
            const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
            // Kleine Werte sind Browser-Chrome (URL-Leiste), keine Tastatur.
            const keyboard = inset > 120 ? inset : 0
            root.style.setProperty('--kb-inset', `${Math.round(keyboard)}px`)
            root.dataset.keyboard = keyboard > 0 ? 'open' : 'closed'
        }

        sync()
        vv.addEventListener('resize', sync)
        vv.addEventListener('scroll', sync)
        return () => {
            vv.removeEventListener('resize', sync)
            vv.removeEventListener('scroll', sync)
            root.style.removeProperty('--kb-inset')
            delete root.dataset.keyboard
        }
    }, [])

    return null
}
