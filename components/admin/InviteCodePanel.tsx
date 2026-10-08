'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    listInviteCodes,
    generateInviteCode,
    deleteInviteCode,
    getInviteCodeRedeemers,
    type InviteCode,
} from '@/app/actions/inviteCodes'
import { inviteStatus, personenLabel, MAX_INVITE_USES, type InviteStatus } from '@/utils/inviteCode'
import { Ticket, Plus, Copy, Check, Mail, Trash2, Loader2, Users } from 'lucide-react'

const EXPIRY_OPTIONS = [
    { label: 'Läuft nie ab', days: 0 },
    { label: '7 Tage gültig', days: 7 },
    { label: '30 Tage gültig', days: 30 },
]

const USES_PRESETS = [1, 2, 5, 10]

function statusOf(code: InviteCode) {
    return inviteStatus(code, new Date(), code.redemptions.length)
}

const STATUS_LABEL: Record<InviteStatus, string> = {
    open: 'Frei',
    exhausted: 'Ausgeschöpft',
    expired: 'Abgelaufen',
}

export default function InviteCodePanel() {
    const [codes, setCodes] = useState<InviteCode[]>([])
    const [emails, setEmails] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<number | null>(null)

    const [note, setNote] = useState('')
    const [expiryDays, setExpiryDays] = useState(0)
    const [maxUses, setMaxUses] = useState(1)

    const load = useCallback(async () => {
        const [codesRes, emailRes] = await Promise.all([listInviteCodes(), getInviteCodeRedeemers()])

        if (codesRes.success) {
            setCodes(codesRes.codes)
            setError(null)
        } else {
            setError(codesRes.error || 'Codes konnten nicht geladen werden.')
        }
        if (emailRes.success) setEmails(emailRes.emails)
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const handleGenerate = async () => {
        setGenerating(true)
        setError(null)

        const res = await generateInviteCode(note, expiryDays, maxUses)
        setGenerating(false)

        if (!res.success) {
            setError(res.error || 'Code konnte nicht erzeugt werden.')
            return
        }
        setNote('')
        setMaxUses(1)
        setCodes(prev => [res.code, ...prev])
    }

    const handleCopy = async (code: InviteCode) => {
        try {
            await navigator.clipboard.writeText(code.code)
            setCopiedId(code.id)
            setTimeout(() => setCopiedId(null), 2000)
        } catch {
            setError('Kopieren hat nicht geklappt — bitte den Code von Hand markieren.')
        }
    }

    const mailtoFor = (code: InviteCode) => {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
        const subject = 'Dein Zugang zur Finanzen-App'
        const body = [
            'Hallo!',
            '',
            'Du kannst dir jetzt einen Account in der Finanzen-App anlegen.',
            '',
            `Einladungscode: ${code.code}`,
            '',
            `1. ${appUrl} öffnen`,
            '2. Auf "Account erstellen" tippen',
            '3. E-Mail, Passwort und den Einladungscode oben eingeben',
            '',
            code.max_uses > 1
                ? `Der Code funktioniert für bis zu ${personenLabel(code.max_uses)} — gib ihn gern an die anderen weiter.`
                : 'Der Code funktioniert nur ein einziges Mal.',
        ].join('\n')

        return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    }

    const handleDelete = async (code: InviteCode) => {
        if (!window.confirm(`Code ${code.code} wirklich löschen?`)) return

        const res = await deleteInviteCode(code.id)
        if (res.success) {
            setCodes(prev => prev.filter(c => c.id !== code.id))
        } else {
            setError(res.error || 'Löschen fehlgeschlagen.')
        }
    }

    const openCount = codes.filter(c => statusOf(c).status === 'open').length

    return (
        <div className="bg-white rounded-[20px] p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-purple-500" />
                Einladungscodes
            </h2>
            <p className="text-sm text-gray-500 mb-4">
                Ohne gültigen Code kann sich niemand registrieren. {openCount} Code{openCount === 1 ? '' : 's'} noch frei.
            </p>

            {/* Generator */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-3 mb-5">
                <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Notiz (optional) — z. B. für wen?"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
                <div>
                    <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Für wie viele Personen?
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {USES_PRESETS.map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setMaxUses(n)}
                                aria-pressed={maxUses === n}
                                className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${maxUses === n
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}
                            >
                                {n}
                            </button>
                        ))}
                        <input
                            type="number"
                            min={1}
                            max={MAX_INVITE_USES}
                            value={maxUses}
                            onChange={(e) => setMaxUses(Math.min(MAX_INVITE_USES, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                            aria-label="Anzahl Personen"
                            className="w-20 px-3 py-2 rounded-full bg-white border border-gray-200 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                        />
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <select
                        value={expiryDays}
                        onChange={(e) => setExpiryDays(Number(e.target.value))}
                        className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                        {EXPIRY_OPTIONS.map(o => (
                            <option key={o.days} value={o.days}>{o.label}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                        {generating
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Plus className="w-4 h-4" />}
                        Code generieren
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm mb-4">{error}</div>
            )}

            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : codes.length === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">
                    Noch keine Codes erzeugt.
                </p>
            ) : (
                <div className="space-y-3 md:max-h-[50vh] md:overflow-y-auto md:pr-2">
                    {codes.map(code => {
                        const info = statusOf(code)
                        const status = info.status
                        return (
                            <div
                                key={code.id}
                                className={`p-4 rounded-xl border flex flex-col gap-2 ${status === 'open'
                                    ? 'bg-purple-50/60 border-purple-200'
                                    : 'bg-gray-50 border-gray-100'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className={`font-mono text-lg font-bold tracking-widest break-all ${status === 'open' ? 'text-purple-700' : 'text-gray-400 line-through'
                                        }`}>
                                        {code.code}
                                    </span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${status === 'open' ? 'bg-green-100 text-green-700'
                                        : status === 'exhausted' ? 'bg-gray-200 text-gray-600'
                                            : 'bg-orange-100 text-orange-700'
                                        }`}>
                                        {STATUS_LABEL[status]}
                                    </span>
                                </div>

                                <div className="text-xs text-gray-500 space-y-0.5">
                                    {code.note && <p className="font-bold text-gray-600">{code.note}</p>}
                                    <p>Erstellt: {new Date(code.created_at).toLocaleDateString('de-DE')}</p>
                                    {code.expires_at && status !== 'exhausted' && (
                                        <p>Gültig bis: {new Date(code.expires_at).toLocaleDateString('de-DE')}</p>
                                    )}
                                    <p className="font-bold text-gray-600">
                                        {info.used}/{info.maxUses} genutzt
                                        {status === 'open' && info.maxUses > 1 ? ` · noch ${personenLabel(info.remaining)}` : ''}
                                    </p>
                                </div>

                                {code.redemptions.length > 0 ? (
                                    <ul className="text-xs text-gray-500 space-y-0.5 border-t border-gray-200/70 pt-2">
                                        {code.redemptions.map(r => (
                                            <li key={r.user_id} className="flex justify-between gap-2">
                                                <span className="truncate">{emails[r.user_id] || 'Konto gelöscht'}</span>
                                                <span className="shrink-0">{new Date(r.redeemed_at).toLocaleDateString('de-DE')}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : code.used_at && (
                                    <p className="text-xs text-gray-500">
                                        Eingelöst am {new Date(code.used_at).toLocaleDateString('de-DE')}
                                        {code.used_by && emails[code.used_by] ? ` von ${emails[code.used_by]}` : ''}
                                    </p>
                                )}

                                <div className="flex flex-wrap gap-2 mt-1">
                                    {status === 'open' && (
                                        <>
                                            <button
                                                onClick={() => handleCopy(code)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                                            >
                                                {copiedId === code.id
                                                    ? <><Check className="w-4 h-4 text-green-600" /> Kopiert</>
                                                    : <><Copy className="w-4 h-4" /> Kopieren</>}
                                            </button>
                                            <a
                                                href={mailtoFor(code)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                                            >
                                                <Mail className="w-4 h-4 text-blue-500" /> Per Mail senden
                                            </a>
                                        </>
                                    )}
                                    <button
                                        onClick={() => handleDelete(code)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" /> Löschen
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
