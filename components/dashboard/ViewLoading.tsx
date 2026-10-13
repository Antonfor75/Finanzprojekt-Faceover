import { Loader2 } from 'lucide-react'

// Ladekreis, solange eine nachgeladene Unteransicht noch nicht da ist
export function ViewLoading() {
    return (
        <div className="w-full flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 animate-spin text-primary" strokeWidth={1.75} />
        </div>
    )
}
