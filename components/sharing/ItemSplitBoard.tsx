'use client'

import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { formatEuro } from '@/utils/sharing/display'
import type { ItemOwner, ShareItem } from '@/utils/sharing/types'
import { allToOwner, boardLayout, columnCents, moveItem, swimClass, type ShareRole } from './shareSheetModel'

type Props = {
    items: ShareItem[]
    meName: string
    friendName: string
    onChange: (items: ShareItem[]) => void
    /** Aus wessen Sicht das Brett gezeigt wird. Der Partner sieht seine eigene Spalte links, die Daten bleiben gleich. */
    viewer?: ShareRole
    title?: string
    subtitle?: string
}

/**
 * Artikel verteilen (Entwurf D1-Final): zwei Spalten, anfangs liegt alles beim creator. Antippen schiebt einen
 * Artikel mit einer welligen Bahn auf die andere Seite (ans Ende der Zielspalte); die Summen oben rechnen live.
 * Welche Spalte links steht, entscheidet shareSheetModel (boardLayout).
 */
export default function ItemSplitBoard({ items, meName, friendName, onChange, viewer = 'creator', title, subtitle }: Props) {
    // Nur der zuletzt verschobene Artikel schwimmt: bleibt die Klasse unverändert, startet React die Bahn beim Neuzeichnen nicht neu.
    const [last, setLast] = useState<{ key: string; className: string } | null>(null)

    const layout = boardLayout(viewer)
    const meOwner = layout.left
    const friendOwner = layout.right
    const meItems = items.filter((i) => i.owner === meOwner)
    const friendItems = items.filter((i) => i.owner === friendOwner)

    const tap = (key: string) => {
        const moved = moveItem(items, key)
        if (!moved) return
        setLast({ key, className: swimClass(moved.to, viewer) })
        onChange(moved.items)
    }

    const reset = () => {
        setLast(null)
        onChange(allToOwner(items, meOwner))
    }

    return (
        <div data-testid="item-board" className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 px-0.5 pb-3.5 pt-1">
                <div className="min-w-0">
                    {title && <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>}
                    {subtitle && <p className="truncate text-[13px] tabular-nums text-muted-foreground">{subtitle}</p>}
                </div>
                <button
                    type="button"
                    onClick={reset}
                    className="press h-10 shrink-0 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
                >
                    Alle zu mir
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <ColumnHead tone="me" name={meName} cents={columnCents(items, meOwner)} testId="board-sum-me" />
                <ColumnHead tone="friend" name={friendName} cents={columnCents(items, friendOwner)} testId="board-sum-friend" />
            </div>

            <div className="relative mt-2.5 grid min-h-0 flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto overflow-x-hidden">
                <div aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1/2 top-1 w-0 border-l-[1.5px] border-dashed border-border" />
                <Column tone="me" owner={meOwner} items={meItems} last={last} onTap={tap} />
                <Column
                    tone="friend"
                    owner={friendOwner}
                    items={friendItems}
                    last={last}
                    onTap={tap}
                    placeholder={friendItems.length === 0 ? `Tippe links einen Artikel – er schwimmt zu ${friendName}` : undefined}
                />
            </div>

            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
                <ArrowLeftRight className="size-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
                Antippen schiebt einen Artikel auf die andere Seite.
            </div>
        </div>
    )
}

function ColumnHead({ tone, name, cents, testId }: { tone: 'me' | 'friend'; name: string; cents: number; testId: string }) {
    const me = tone === 'me'
    return (
        <div className={`flex items-center gap-2.5 rounded-[22px] border-2 bg-card px-3 py-2.5 ${me ? 'border-primary' : 'border-partner'}`}>
            <span
                aria-hidden="true"
                className={`flex size-[38px] shrink-0 items-center justify-center rounded-full font-extrabold ${me ? 'bg-primary text-primary-foreground' : 'bg-partner text-background'}`}
            >
                {name.charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-foreground">{name}</span>
                <span data-testid={testId} className="font-display text-[17px] font-extrabold tabular-nums text-foreground transition-colors duration-300">
                    {formatEuro(cents / 100)}
                </span>
            </span>
        </div>
    )
}

function Column({ tone, owner, items, last, onTap, placeholder }: {
    tone: 'me' | 'friend'
    owner: ItemOwner
    items: ShareItem[]
    last: { key: string; className: string } | null
    onTap: (key: string) => void
    placeholder?: string
}) {
    const me = tone === 'me'
    return (
        <div data-testid={`board-column-${tone}`} data-owner={owner} className={`flex flex-col gap-1.5 py-1 ${me ? 'pr-1' : 'pl-1'}`}>
            {items.map((i) => (
                <button
                    key={i.key}
                    type="button"
                    data-testid="board-item"
                    data-owner={i.owner}
                    onClick={() => onTap(i.key)}
                    aria-label={`${i.name_raw}, ${formatEuro(Number(i.total_price))}. Antippen verschiebt auf die andere Seite.`}
                    className={`press flex h-10 w-full shrink-0 items-center justify-between gap-1.5 rounded-[14px] px-3 text-left text-sm text-foreground ${me ? 'bg-primary/15' : 'bg-partner/15'} ${last?.key === i.key ? last.className : ''}`}
                >
                    <span className="truncate">{i.name_raw}</span>
                    <span className="shrink-0 tabular-nums">{formatEuro(Number(i.total_price))}</span>
                </button>
            ))}
            {placeholder && (
                <div
                    data-testid="board-placeholder"
                    className="mt-1.5 rounded-2xl border-[1.5px] border-dashed border-partner/40 px-3 py-[18px] text-center text-[13px] leading-snug text-partner"
                >
                    {placeholder}
                </div>
            )}
        </div>
    )
}
