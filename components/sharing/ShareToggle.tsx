'use client'

/** Schalter "Mit <name> teilen" beim Eintragen einer Ausgabe bzw. Speichern eines Bons (nur mit verknüpftem Freund). */
export default function ShareToggle({ handle, checked, onChange }: { handle: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="press flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-muted/60 px-4 py-3.5 text-left transition-[background-color,border-color] duration-200 hover:bg-muted"
        >
            <span className="min-w-0 truncate text-sm font-medium text-foreground">Mit {handle} teilen</span>
            <span
                aria-hidden="true"
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-partner' : 'bg-border'}`}
            >
                <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-card shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
            </span>
        </button>
    )
}
