import { isStale, type PendingReceiptRow } from '@/utils/receiptScan/fields'
import type { AgentView } from './AgentPanel'

const fmtEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
const fmtDay = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return y && m && d ? `${d}.${m}.${y}` : iso
}

/** Was das Agent-Feld zu einem offenen Bon zeigt. */
export function agentViewOf(row: PendingReceiptRow, runningSince: number | undefined): AgentView {
    const base = { findings: [], message: null, steps: [], itemCount: 0 }
    if (runningSince !== undefined) return { ...base, status: 'running', startedAt: runningSince }
    if (row.status === 'failed') return { ...base, status: 'failed', message: row.error ?? row.message ?? 'Der Bon konnte nicht gelesen werden.' }
    if (isStale(row)) return { ...base, status: 'stopped', message: 'Die Auswertung wurde unterbrochen — erneut prüfen lassen oder selbst eintragen.' }
    const r = row.result
    if (r) {
        return {
            status: 'done',
            findings: row.findings ?? [],
            message: row.message,
            steps: [
                { label: 'Laden', value: r.store },
                { label: 'Datum', value: r.date ? fmtDay(r.date) : null },
                { label: 'Summe', value: r.total !== null ? fmtEuro(r.total) : null },
                { label: 'Kategorie', value: r.category },
            ],
            itemCount: r.items.length,
        }
    }
    if (row.message) return { ...base, status: 'stopped', message: row.message }
    return { ...base, status: 'idle' }
}
