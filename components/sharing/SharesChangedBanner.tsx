'use client'

import { ChevronRight } from 'lucide-react'
import { bannerText } from './friendLinkModel'

/** Hinweis oben auf der Startseite: Der Freund hat geteilte Ausgaben eingetragen oder geändert. */
export default function SharesChangedBanner({ count, friendHandle, onOpen }: {
    count: number
    friendHandle: string
    onOpen: () => void
}) {
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex justify-center px-4">
            <button
                type="button"
                onClick={onOpen}
                className="view-enter press pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-full border border-border bg-card/90 py-2.5 pl-4 pr-3 text-left shadow-lg shadow-foreground/5 backdrop-blur-md"
            >
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-partner" />
                <span className="flex-1 text-sm font-medium text-foreground">{bannerText(friendHandle, count)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            </button>
        </div>
    )
}
