'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/utils/supabase'
import { signUpWithInviteCode } from '@/app/actions/auth'
import { MIN_PASSWORD_LENGTH } from '@/utils/authRules'
import PasswordInput from '@/components/PasswordInput'
import { Loader2, ArrowRight, ArrowLeft, MailCheck, PlayCircle } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'

const INPUT_CLASS =
    'w-full px-4 py-3.5 rounded-xl bg-muted/60 border border-transparent text-foreground font-medium outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-strong)] focus:bg-card focus:border-border focus:shadow-sm placeholder:text-muted-foreground/60'

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
    login: {
        title: 'Finanzen',
        subtitle: 'Melde dich an, um dein Budget zu sehen.',
        submit: 'Anmelden',
    },
    signup: {
        title: 'Account erstellen',
        subtitle: 'Für die Registrierung brauchst du einen Einladungscode.',
        submit: 'Account erstellen',
    },
    forgot: {
        title: 'Passwort vergessen',
        subtitle: 'Wir schicken dir einen Link zum Zurücksetzen.',
        submit: 'Link anfordern',
    },
}

export default function LoginScreen() {
    // Aus der Demo kommt man per /?signup=1 direkt in die Registrierung. LoginScreen
    // rendert nur im Browser (nach dem Session-Check), window ist also da.
    const [mode, setMode] = useState<Mode>(() =>
        typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('signup') === '1'
            ? 'signup'
            : 'login'
    )

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [passwordRepeat, setPasswordRepeat] = useState('')
    const [inviteCode, setInviteCode] = useState('')
    const [privacyAccepted, setPrivacyAccepted] = useState(false)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)

    const switchMode = (next: Mode) => {
        setMode(next)
        setError(null)
        setInfo(null)
        setPassword('')
        setPasswordRepeat('')
        setInviteCode('')
        setPrivacyAccepted(false)
    }

    const handleLogin = async () => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
            setError(error.message)
            setLoading(false)
            return
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email === 'chef@anton.de') {
            window.location.href = '/admin'
            return
        }
        // Erfolg — der Session-State in page.tsx übernimmt ab hier.
    }

    const handleSignup = async () => {
        if (password !== passwordRepeat) {
            setError('Die beiden Passwörter stimmen nicht überein.')
            setLoading(false)
            return
        }

        if (!privacyAccepted) {
            setError('Bitte bestätige, dass du die Datenschutzerklärung zur Kenntnis genommen hast.')
            setLoading(false)
            return
        }

        const result = await signUpWithInviteCode(email, password, inviteCode, privacyAccepted)

        if (!result.success) {
            setError(result.error)
            setLoading(false)
            return
        }

        // Account steht — direkt anmelden, damit niemand zweimal tippen muss.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
            setInfo('Account erstellt! Du kannst dich jetzt anmelden.')
            switchMode('login')
            setLoading(false)
        }
    }

    const handleForgot = async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })

        setLoading(false)
        if (error) {
            setError(error.message)
            return
        }
        // Bewusst neutral formuliert — verrät nicht, ob es die Adresse gibt.
        setInfo('Falls es zu dieser Adresse einen Account gibt, ist die E-Mail unterwegs. Schau auch im Spam-Ordner nach.')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setInfo(null)

        if (mode === 'login') await handleLogin()
        else if (mode === 'signup') await handleSignup()
        else await handleForgot()
    }

    const copy = COPY[mode]

    return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center p-6 relative overflow-hidden bg-background">

            <div className="ambient-bg" />

            <div className="w-full max-w-sm z-10 flex flex-col view-enter py-8">

                {/* Wordmark */}
                <div className="mb-10">
                    {mode === 'login' ? (
                        <p className="eyebrow mb-3">Persönliche Finanzen</p>
                    ) : (
                        <button
                            type="button"
                            onClick={() => switchMode('login')}
                            className="flex items-center gap-1.5 eyebrow mb-3 hover:text-foreground transition-colors duration-200"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
                            Zurück zur Anmeldung
                        </button>
                    )}
                    <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
                        {copy.title}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        {copy.subtitle}
                    </p>
                </div>

                {/* Card */}
                <div className="surface p-6">

                    {error && (
                        <div className="mb-5 px-4 py-3 rounded-xl bg-[color-mix(in_srgb,var(--chart-neg)_10%,white)] border border-[var(--chart-neg)]/30" role="alert">
                            <p className="text-sm font-medium text-[var(--chart-neg-heavy)]">
                                {error}
                            </p>
                        </div>
                    )}

                    {info && (
                        <div className="mb-5 px-4 py-3 rounded-xl bg-[color-mix(in_srgb,var(--chart-pos)_12%,white)] border border-[var(--chart-pos)]/30" role="status">
                            <p className="text-sm font-medium text-foreground flex items-start gap-2">
                                <MailCheck className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                                {info}
                            </p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="auth-email" className="text-xs font-medium text-muted-foreground pl-1">
                                E-Mail
                            </label>
                            <input
                                id="auth-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={INPUT_CLASS}
                            />
                        </div>

                        {mode !== 'forgot' && (
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="auth-password" className="text-xs font-medium text-muted-foreground pl-1">
                                    Passwort
                                </label>
                                <PasswordInput
                                    id="auth-password"
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                    required
                                    minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                                    value={password}
                                    onChange={setPassword}
                                    className={INPUT_CLASS}
                                />
                                {mode === 'signup' && (
                                    <p className="text-xs text-muted-foreground/80 pl-1">
                                        Mindestens {MIN_PASSWORD_LENGTH} Zeichen.
                                    </p>
                                )}
                            </div>
                        )}

                        {mode === 'signup' && (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="auth-password-repeat" className="text-xs font-medium text-muted-foreground pl-1">
                                        Passwort wiederholen
                                    </label>
                                    <PasswordInput
                                        id="auth-password-repeat"
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

                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="auth-invite" className="text-xs font-medium text-muted-foreground pl-1">
                                        Einladungscode
                                    </label>
                                    <input
                                        id="auth-invite"
                                        type="text"
                                        inputMode="text"
                                        autoCapitalize="characters"
                                        autoComplete="off"
                                        required
                                        placeholder="ABCD-EF23"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                        className={`${INPUT_CLASS} tracking-[0.2em] uppercase text-center font-semibold`}
                                    />
                                </div>

                                <label htmlFor="auth-privacy" className="flex items-start gap-3 px-1 pt-1 cursor-pointer">
                                    <input
                                        id="auth-privacy"
                                        type="checkbox"
                                        required
                                        checked={privacyAccepted}
                                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                        className="mt-0.5 w-5 h-5 shrink-0 rounded-md accent-[var(--color-primary)]"
                                    />
                                    <span className="text-xs text-muted-foreground leading-relaxed">
                                        Ich habe die{' '}
                                        <Link href="/datenschutz" target="_blank" className="font-semibold text-foreground underline underline-offset-2">
                                            Datenschutzerklärung
                                        </Link>{' '}
                                        zur Kenntnis genommen.
                                    </span>
                                </label>
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (mode === 'signup' && !privacyAccepted)}
                            className="press group mt-3 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-base disabled:opacity-60 transition-[background-color] duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)]"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {copy.submit}
                                    <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={2} />
                                </>
                            )}
                        </button>
                    </form>

                    {mode === 'login' && (
                        <button
                            type="button"
                            onClick={() => switchMode('forgot')}
                            className="w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 mt-4"
                        >
                            Passwort vergessen?
                        </button>
                    )}
                </div>

                {mode === 'login' && (
                    <div className="mt-6 text-center">
                        <p className="text-sm text-muted-foreground">
                            Noch keinen Account?
                        </p>
                        <button
                            type="button"
                            onClick={() => switchMode('signup')}
                            className="press mt-3 w-full py-3.5 rounded-xl border border-border bg-card/60 font-semibold text-foreground text-base hover:bg-card transition-colors duration-200"
                        >
                            Account erstellen
                        </button>
                        <Link
                            href="/demo"
                            className="press mt-3 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-primary text-base hover:bg-card/60 transition-colors duration-200"
                        >
                            <PlayCircle className="w-4 h-4" strokeWidth={2} />
                            App ausprobieren (Demo)
                        </Link>
                    </div>
                )}

                <nav className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground">
                    <Link href="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
                    <span aria-hidden>·</span>
                    <Link href="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
                </nav>
            </div>
        </div>
    )
}
