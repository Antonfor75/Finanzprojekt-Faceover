'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Kurzbeschreibung des Bons, z. B. "Lidl · 12,34 € · 05.10.2026". */
    summary: string
    onConfirm: () => void
}

/** Sicherheitsabfrage vor dem endgültigen Verwerfen eines offenen Bons. "Abbrechen" ist die Vorauswahl. */
export default function DiscardReceiptDialog({ open, onOpenChange, summary, onConfirm }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="rounded-3xl max-w-sm" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Bon endgültig verwerfen?</DialogTitle>
                    <DialogDescription>
                        {summary}. Das Foto und die erkannten Artikel werden gelöscht. Das lässt sich nicht rückgängig machen.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <button autoFocus onClick={() => onOpenChange(false)} className="press w-full py-3 rounded-xl font-semibold bg-muted text-foreground">
                        Abbrechen
                    </button>
                    <button onClick={() => { onOpenChange(false); onConfirm() }} className="press w-full py-3 rounded-xl font-semibold bg-[var(--chart-neg-heavy)] text-white">
                        Ja, verwerfen
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
