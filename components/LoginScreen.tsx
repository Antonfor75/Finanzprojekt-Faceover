'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react'

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
            // Success - session state in page.tsx will take over via onAuthStateChange
            // No need to explicitly redirect or stop loading, component will unmount
        }
    }

    // Optional: Auto-focus or pre-fill logic could go here

    return (
        <div className="h-[100dvh] w-full bg-[#f8f5e6] flex flex-col items-center justify-center p-6 relative overflow-hidden">

            {/* Background Decorations (optional subtle blobs) */}
            <div className="absolute top-[-10%] left-[-10%] w-[50vh] h-[50vh] bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50vh] h-[50vh] bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

            <div className="w-full max-w-sm z-10">
                <div className="text-center mb-10">
                    <div className="bg-black text-white inline-flex p-4 rounded-3xl mb-4 shadow-xl rotate-[-3deg]">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">Login</h1>
                    <p className="text-gray-500 font-medium">Willkommen zurück!</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 border border-red-100 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="mt-1 min-w-[5px] h-[5px] rounded-full bg-red-500" />
                        <span className="text-sm font-bold">{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                        </div>
                        <input
                            type="email"
                            placeholder="Email Adresse"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="block w-full pl-12 pr-4 py-4 bg-white border-2 border-transparent focus:border-black rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.05)] outline-none transition-all placeholder:text-gray-300 font-medium text-lg"
                        />
                    </div>

                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                        </div>
                        <input
                            type="password"
                            placeholder="Passwort"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="block w-full pl-12 pr-4 py-4 bg-white border-2 border-transparent focus:border-black rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.05)] outline-none transition-all placeholder:text-gray-300 font-medium text-lg"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black text-white p-4 rounded-2xl font-bold text-lg hover:bg-gray-800 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 mt-4"
                    >
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                Anmelden <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
