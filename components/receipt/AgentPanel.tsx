'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Bot, CheckCircle2, Loader2 } from 'lucide-react'
import type { Finding } from '@/utils/receiptScan/fields'

export type AgentView = {
    /** stopped = abgebrochen oder unterbrochen, ohne Ergebnis. */
    status: 'idle' | 'running' | 'done' | 'failed' | 'stopped'
    /** Startzeit der laufenden Auswertung (ms). */
    startedAt?: number
    findings: Finding[]
    message: string | null
    /** Ergebnis-Häppchen für die Liste unter dem Balken. */
    steps: { label: string; value: string | null }[]
    itemCount: number
}

/** So lange braucht Gemini meist für einen Bon — nur für die Fortschrittsanzeige. */
const EXPECTED_MS = 9000

const fmtSeconds = (ms: number) => `${Math.max(0, Math.round(ms / 1000))} s`

type Props = {
    state: AgentView
    onCancel: () => void
    onRetry: () => void
}

/**
 * Zeigt, dass der Agent (Gemini) den Beleg gerade liest: Balken mit Laufzeit, danach jedes Ergebnis
 * (dieselben Werte stehen auch in den Feldern darüber) und die Hinweise der Prüfung.
 * Aufbau wie components/AgentPanel.tsx der Handy-App.
 */
export default function AgentPanel({ state, onCancel, onRetry }: Props) {
    const [now, setNow] = useState(() => Date.now())
    const running = state.status === 'running'

    useEffect(() => {
        if (!running) return
        const t = setInterval(() => setNow(Date.now()), 250)
        return () => clearInterval(t)
    }, [running])

    if (state.status === 'idle') return null

    const elapsed = running && state.startedAt ? now - state.startedAt : 0
    // Nähert sich 95 % an und springt erst mit dem Ergebnis auf 100 %.
    const pct = state.status === 'done' ? 100 : running ? Math.round(95 * (1 - Math.exp(-elapsed / EXPECTED_MS))) : 0
    const label = running
        ? elapsed < 1500 ? 'Bild wird übergeben …'
            : elapsed < 60_000 ? 'Gemini liest den Bon …'
            : 'Gemini Flash ist ausgelastet — Flash-Lite springt ein …'
        : 'Beleg geprüft'

    return (
        <div className="surface p-4 flex flex-col gap-3" aria-live="polite">
            <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" strokeWidth={1.75} />
                <span className="eyebrow">Agent</span>
                {running && <span className="ml-auto text-xs text-muted-foreground">{fmtSeconds(elapsed)}</span>}
            </div>

            {(running || state.status === 'done') && (
                <div className="flex flex-col gap-1.5">
                    <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        className="h-2 w-full rounded-full bg-muted overflow-hidden"
                    >
                        <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-foreground">
                        {running ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <CheckCircle2 className="w-4 h-4 text-[var(--chart-pos)]" strokeWidth={1.75} />}
                        <span>{label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{pct} %</span>
                    </div>
                </div>
            )}

            {state.status === 'done' && state.steps.length > 0 && (
                <ul className="flex flex-col gap-1">
                    {state.steps.map((s) => (
                        <li key={s.label} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${s.value ? 'text-[var(--chart-pos)]' : 'text-muted-foreground'}`} strokeWidth={1.75} />
                            <span className="text-muted-foreground">{s.label}</span>
                            <span className="font-medium text-foreground truncate">{s.value ?? 'nicht erkannt'}</span>
                        </li>
                    ))}
                </ul>
            )}

            {state.status === 'done' && state.itemCount > 0 && (
                <p className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--chart-pos)]" strokeWidth={1.75} />
                    <span className="text-muted-foreground">Artikel</span>
                    <span className="font-medium text-foreground">{state.itemCount} gelesen</span>
                </p>
            )}

            {!running && state.findings.map((f, i) => (
                <p key={i} className={`flex items-start gap-2 text-xs ${f.severity === 'error' ? 'text-[var(--chart-neg-heavy)]' : 'text-muted-foreground'}`}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                    {f.message}
                </p>
            ))}

            {state.message && !running && (
                <p className={`flex items-start gap-2 text-xs ${state.status === 'failed' ? 'text-[var(--chart-neg-heavy)]' : 'text-muted-foreground'}`}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                    {state.message}
                </p>
            )}

            <div className="flex gap-2">
                {running && (
                    <button onClick={onCancel} className="press px-4 py-2 rounded-full text-sm font-medium bg-muted text-foreground">
                        Abbrechen — selbst eintragen
                    </button>
                )}
                {!running && (
                    <button onClick={onRetry} className="press px-4 py-2 rounded-full text-sm font-medium bg-muted text-foreground">
                        Agent erneut prüfen lassen
                    </button>
                )}
            </div>
        </div>
    )
}
