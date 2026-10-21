import { Users } from 'lucide-react'
import type { Expense } from '@/app/types'
import { shareBadgeText } from '@/utils/sharing/display'

/** Pille im Verlauf (E1): "Geteilt mit lena · 50 %" bzw. "Von lena geteilt · Artikel". Nichts bei nicht geteilter Ausgabe. */
export default function ShareBadge({ expense }: { expense: Pick<Expense, 'amount' | 'share_total' | 'share_mode' | 'share_note'> }) {
    const text = shareBadgeText(expense)
    if (!text) return null
    return (
        <span
            data-testid="share-badge"
            className="inline-flex h-[22px] max-w-full items-center gap-1.5 self-start rounded-full bg-partner/15 px-2 text-xs font-semibold text-partner"
        >
            <Users className="size-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
            <span className="truncate">{text}</span>
        </span>
    )
}
