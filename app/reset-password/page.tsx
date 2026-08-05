'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase'
import PasswordInput from '@/components/PasswordInput'
import { MIN_PASSWORD_LENGTH, validatePassword } from '@/utils/authRules'
import { Loader2, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'

const INPUT_CLASS =
    'w-full px-4 py-3.5 rounded-xl bg-muted/60 border border-transparent text-foreground font-medium outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-strong)] focus:bg-card focus:border-border focus:shadow-sm placeholder:text-muted-foreground/60'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
    const router = useRouter()
    const [status, setStatus] = useState<Status>('checking')

    const [password, setPassword] = useState('')
    const [passwordRepeat, setPasswordRepeat] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Den Link aus der E-Mail in eine Session umwandeln. Supabase nutzt je nach
    // Konfiguration ?code=… (PKCE) oder ein Token im URL-Fragment — beides abdecken.
    useEffect(() => {
        let cancelled = false

        const run = async () => {
            const params = new URLSearchParams(window.location.search)

            const errorDescription = params.get('error_description')
            if (errorDescription) {
                if (!cancelled) {
                    setError(errorDescription)
                    setStatus('invalid')
                }
                return
            }

            const code = params.get('code')
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code)
                if (cancelled) return
                if (error) {
                    setError(error.message)
                    setStatus('invalid')
                    return
                }
                // Code ist verbraucht — aus der Adresszeile nehmen, damit ein
                // Neuladen nicht in einen Fehler läuft.
                window.history.replaceState({}, '', '/reset-password')
                setStatus('ready')
                return
            }

            const { data: { session } } = await supabase.auth.getSession()
            if (cancelled) return
            if (session) {
                setStatus('ready')
                return
            }

            // Token im Fragment wird vom Client asynchron verarbeitet — einmal nachfassen.
            setTimeout(async () => {
                const { data: { session: retry } } = await supabase.auth.getSession()
                if (cancelled) return
                setStatus(retry ? 'ready' : 'invalid')
            }, 800)
        }

        run()
        return () => { cancelled = true }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (password !== passwordRepeat) {
            setError('Die beiden Passwörter stimmen nicht überein.')
            return
        }

        const passwordError = validatePassword(password)
        if (passwordError) {
            setError(passwordError)
            return
        }

        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password })
        setSaving(false)

        if (error) {
            setError(error.message)
            return
        }

        setStatus('done')
        setTimeout(() => router.replace('/'), 1800)
    }

    return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 relative overflow-hidden bg-background">

            <div className="ambient-bg" />

            <div className="w-full max-w-sm z-10 flex flex-col view-enter py-8">

                {status === 'checking' && (
                    <div className="flex flex-col items-center gap-5 py-12">
                        <Loader2 className="w-7 h-7 animate-spin text-primary" strokeWidth={1.75} />
                        <p className="eyebrow">Link wird geprüft</p>
                    </div>
                )}

                {status === 'invalid' && (
                    <>
                        <div className="mb-8">
                            <p className="eyebrow mb-3">Passwort zurücksetzen</p>
                            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                                Link ungültig oder abgelaufen
                            </h1>
                        </div>
                        <div className="surface p-6">
                            <p className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--chart-neg-heavy)]" strokeWidth={1.75} />
                                {error || 'Fordere auf der Anmeldeseite einen neuen Link an — die Links sind nur begrenzt gültig.'}
                            </p>
                            <button
                                onClick={() => router.replace('/')}
                                className="press mt-6 w-full bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-base"
                            >
                                Zur Anmeldung
                            </button>
                        </div>
                    </>
                )}

                {status === 'done' && (
                    <>
                        <div className="mb-8">
                            <p className="eyebrow mb-3">Passwort zurücksetzen</p>
                            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
                                Passwort geändert
                            </h1>
                        </div>
                        <div className="surface p-6">
                            <p className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2">
                                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-[var(--chart-pos)]" strokeWidth={1.75} />
                                Dein neues Passwort ist gespeichert. Du wirst weitergeleitet …
                            </p>
                        </div>
                    </>
                )}

                {status === 'ready' && (
                    <>
                        <div className="mb-10">
                            <p className="eyebrow mb-3">Passwort zurücksetzen</p>
                            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
                                Neues Passwort
                            </h1>
                            <p className="text-sm text-muted-foreground mt-2">
                                Vergib ein neues Passwort für deinen Account.
                            </p>
                        </div>

                        <div className="surface p-6">
                            {error && (
                                <div className="mb-5 px-4 py-3 rounded-xl bg-[color-mix(in_srgb,var(--chart-neg)_10%,white)] border border-[var(--chart-neg)]/30" role="alert">
                                    <p className="text-sm font-medium text-[var(--chart-neg-heavy)]">{error}</p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="new-password" className="text-xs font-medium text-muted-foreground pl-1">
                                        Neues Passwort
                                    </label>
                                    <PasswordInput
                                        id="new-password"
                                        autoComplete="new-password"
                                        required
                                        autoFocus
                                        minLength={MIN_PASSWORD_LENGTH}
                                        value={password}
                                        onChange={setPassword}
                                        className={INPUT_CLASS}
                                    />
                                    <p className="text-xs text-muted-foreground/80 pl-1">
                                        Mindestens {MIN_PASSWORD_LENGTH} Zeichen.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="new-password-repeat" className="text-xs font-medium text-muted-foreground pl-1">
                                        Passwort wiederholen
                                    </label>
                                    <PasswordInput
                                        id="new-password-repeat"
                                        autoComplete="new-password"
                                        required
                                        minLength={MIN_PASSWORD_LENGTH}
                                        value={passwordRepeat}
                                        onChange={setPasswordRepeat}
                                        className={INPUT_CLASS}
                                    />
                                    {passwordRepeat.length > 0 && password !== passwordRepeat && (
                                        <p className="text-xs text-[var(--chart-neg-heavy)] pl-1">
                                            Die Passwörter stimmen noch nicht überein.
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="press group mt-3 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-base disabled:opacity-60 transition-[background-color] duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)]"
                                >
                                    {saving ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Passwort speichern
                                            <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={2} />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
