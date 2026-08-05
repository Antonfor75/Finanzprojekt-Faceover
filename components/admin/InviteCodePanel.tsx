'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    listInviteCodes,
    generateInviteCode,
    deleteInviteCode,
    getInviteCodeRedeemers,
    type InviteCode,
} from '@/app/actions/inviteCodes'
import { Ticket, Plus, Copy, Check, Mail, Trash2, Loader2 } from 'lucide-react'

const EXPIRY_OPTIONS = [
    { label: 'Läuft nie ab', days: 0 },
    { label: '7 Tage gültig', days: 7 },
    { label: '30 Tage gültig', days: 30 },
]

type CodeStatus = 'used' | 'expired' | 'open'

function statusOf(code: InviteCode): CodeStatus {
    if (code.used_at) return 'used'
    if (code.expires_at && new Date(code.expires_at) <= new Date()) return 'expired'
    return 'open'
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

        const res = await generateInviteCode(note, expiryDays)
        setGenerating(false)

        if (!res.success) {
            setError(res.error || 'Code konnte nicht erzeugt werden.')
            return
        }
        setNote('')
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
            'Der Code funktioniert nur ein einziges Mal.',
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

    const openCount = codes.filter(c => statusOf(c) === 'open').length

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
                        const status = statusOf(code)
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
                                        : status === 'used' ? 'bg-gray-200 text-gray-600'
                                            : 'bg-orange-100 text-orange-700'
                                        }`}>
                                        {status === 'open' ? 'Frei' : status === 'used' ? 'Eingelöst' : 'Abgelaufen'}
                                    </span>
                                </div>

                                <div className="text-xs text-gray-500 space-y-0.5">
                                    {code.note && <p className="font-bold text-gray-600">{code.note}</p>}
                                    <p>Erstellt: {new Date(code.created_at).toLocaleDateString('de-DE')}</p>
                                    {code.expires_at && status !== 'used' && (
                                        <p>Gültig bis: {new Date(code.expires_at).toLocaleDateString('de-DE')}</p>
                                    )}
                                    {code.used_at && (
                                        <p>
                                            Eingelöst am {new Date(code.used_at).toLocaleDateString('de-DE')}
                                            {code.used_by && emails[code.used_by] ? ` von ${emails[code.used_by]}` : ''}
                                        </p>
                                    )}
                                </div>

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
