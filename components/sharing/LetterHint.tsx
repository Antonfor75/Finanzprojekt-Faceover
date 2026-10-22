'use client'

import { ChevronRight } from 'lucide-react'

/**
 * Kleiner Hinweis auf der Startseite: Ein Brief (Freundschaftsanfrage) wurde auf später gestellt.
 * Antippen öffnet den Brief wieder. `lowered` setzt den Hinweis unter den Banner „Freund hat geteilt“.
 */
export default function LetterHint({ text, onOpen, lowered = false }: {
    text: string
    onOpen: () => void
    lowered?: boolean
}) {
    return (
        <div className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4 ${lowered ? 'top-[calc(env(safe-area-inset-top)+4.25rem)]' : 'top-[calc(env(safe-area-inset-top)+0.75rem)]'}`}>
            <button
                type="button"
                data-testid="letter-hint"
                onClick={onOpen}
                className="view-enter press pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-full border border-border bg-card/90 py-2.5 pl-4 pr-3 text-left shadow-lg shadow-foreground/5 backdrop-blur-md"
            >
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-primary" />
                <span className="flex-1 text-sm font-medium text-foreground">{text}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            </button>
        </div>
    )
}
