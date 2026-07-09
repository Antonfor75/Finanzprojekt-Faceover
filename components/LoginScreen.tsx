'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'
import { Loader2, ArrowRight } from 'lucide-react'

export default function LoginScreen() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else {
            // Check for admin
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email === 'chef@anton.de') {
                window.location.href = '/admin' // Force reload/redirect
                return
            }
            // Success - session state in page.tsx will take over
        }
    }

    return (
        <div className="h-[100dvh] w-full flex items-center justify-center p-6 relative overflow-hidden bg-background">

            <div className="ambient-bg" />

            <div className="w-full max-w-sm z-10 flex flex-col view-enter">

                {/* Wordmark */}
                <div className="mb-12">
                    <p className="eyebrow mb-3">Persönliche Finanzen</p>
                    <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
                        Finanzen
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Melde dich an, um dein Budget zu sehen.
                    </p>
                </div>

                {/* Card */}
                <div className="surface p-6">

                    {error && (
                        <div className="mb-5 px-4 py-3 rounded-xl bg-[color-mix(in_srgb,var(--chart-neg)_10%,white)] border border-[var(--chart-neg)]/30" role="alert">
                            <p className="text-sm font-medium text-[var(--chart-neg-heavy)]">
                                Anmeldung fehlgeschlagen. {error}
                            </p>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="flex flex-col gap-4">

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground pl-1">
                                E-Mail
                            </label>
                            <input
                                id="login-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl bg-muted/60 border border-transparent text-foreground font-medium outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-strong)] focus:bg-card focus:border-border focus:shadow-sm placeholder:text-muted-foreground/60"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground pl-1">
                                Passwort
                            </label>
                            <input
                                id="login-password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl bg-muted/60 border border-transparent text-foreground font-medium outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-strong)] focus:bg-card focus:border-border focus:shadow-sm"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="press group mt-3 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-base disabled:opacity-60 transition-[background-color] duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)]"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Anmelden
                                    <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:translate-x-0.5" strokeWidth={2} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
