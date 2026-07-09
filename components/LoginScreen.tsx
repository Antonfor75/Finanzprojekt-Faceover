'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup } from '@/components/ui/field'

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
            
            {/* Lively animated background (Apple-style smooth blobs) */}
            <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '2s', animationDuration: '4s' }}></div>
            <div className="absolute top-[20%] right-[10%] w-[30vw] h-[30vw] bg-white rounded-full mix-blend-overlay filter blur-2xl opacity-50 animate-pulse" style={{ animationDelay: '1s', animationDuration: '5s' }}></div>

            
            {/* Content Container - Apple Style (Symmetric, strong rounding, frosted glass) */}
            <div className="w-full max-w-sm z-10 flex flex-col">
                
                {/* Title Section perfectly centered, elegant light font */}
                <div className="text-center mb-8 flex flex-col items-center">
                    <div className="bg-white/50 p-5 rounded-[2rem] backdrop-blur-md shadow-sm border border-white/60 mb-6">
                        <Lock className="w-10 h-10 text-primary" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-4xl font-light text-foreground tracking-widest mb-2 uppercase">Finanzen</h1>
                </div>

                {/* Main Card - Glassmorphism */}
                <div className="bg-white/70 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] p-8 border border-white/70">
                    
                    {error && (
                        <div className="bg-red-50/90 backdrop-blur-sm text-red-600 p-4 rounded-2xl mb-6 flex items-center gap-3 border border-red-100">
                            <span className="text-sm font-semibold">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        <FieldGroup>
                            <Field>
                                <div className="relative group/input">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                                        <Mail className="h-5 w-5 text-muted-foreground group-focus-within/input:text-primary transition-colors" />
                                    </div>
                                    <Input
                                        type="email"
                                        placeholder="Email Adresse"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-auto w-full pl-12 pr-4 py-4 bg-white/60 border border-transparent focus-visible:border-transparent focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-primary rounded-2xl transition-colors duration-200 ease-out placeholder:text-muted-foreground font-medium text-lg text-foreground hover:bg-white/80"
                                    />
                                </div>
                            </Field>

                            <Field>
                                <div className="relative group/input">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                                        <Lock className="h-5 w-5 text-muted-foreground group-focus-within/input:text-primary transition-colors" />
                                    </div>
                                    <Input
                                        type="password"
                                        placeholder="Passwort"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="h-auto w-full pl-12 pr-4 py-4 bg-white/60 border border-transparent focus-visible:border-transparent focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-primary rounded-2xl transition-colors duration-200 ease-out placeholder:text-muted-foreground font-medium text-lg text-foreground hover:bg-white/80"
                                    />
                                </div>
                            </Field>

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-auto bg-primary text-primary-foreground p-6 rounded-full font-bold text-lg hover:opacity-90 active:scale-[0.98] shadow-md transition-transform duration-300 active:duration-75 ease-out"
                                >
                                    {loading ? (
                                        <Loader2 className="animate-spin" data-icon="inline-start" />
                                    ) : null}
                                    Anmelden
                                    {!loading ? <ArrowRight data-icon="inline-end" /> : null}
                                </Button>
                            </div>
                        </FieldGroup>
                    </form>
                </div>
            </div>
        </div>
    )
}

