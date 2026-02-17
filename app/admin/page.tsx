'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase'
import { getUsers, createUser, deleteUserData as deleteUser, resetUserData as resetUser } from '@/app/actions/admin'
import { Plus, Users, LogOut, Check, ShieldAlert, RefreshCcw, Calculator, Loader2, AlertCircle } from 'lucide-react'

// Hardcoded Admin Email
const ADMIN_EMAIL = 'chef@anton.de'

export default function AdminPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [users, setUsers] = useState<any[]>([])
    const [isAdmin, setIsAdmin] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dbSize, setDbSize] = useState<number>(0)

    // Form State
    const [newUserEmail, setNewUserEmail] = useState('')
    const [newUserPassword, setNewUserPassword] = useState('')
    const [createStatus, setCreateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')

    // 1. Check Auth & Fetch Users
    useEffect(() => {
        let mounted = true

        // Timeout safety for Auth check (max 5 seconds)
        const initTimeout = setTimeout(() => {
            if (mounted && loading) {
                setLoading(false)
                setError("Zeitüberschreitung beim Laden des Admin-Bereichs.")
            }
        }, 8000)

        const init = async () => {
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession()

                if (sessionError) throw new Error("Session Error: " + sessionError.message)

                if (!session || session.user.email !== ADMIN_EMAIL) {
                    // Not authorized
                    if (mounted) router.replace('/')
                    return
                }

                if (mounted) setIsAdmin(true)
                // Don't await users, fetch in background
                fetchUsers()
            } catch (err: any) {
                console.error("Admin Init Error:", err)
                if (mounted) setError("Fehler: " + (err.message || "Unbekannt"))
            } finally {
                if (mounted) {
                    setLoading(false)
                    clearTimeout(initTimeout)
                }
            }
        }

        init()

        return () => {
            mounted = false
            clearTimeout(initTimeout)
        }
    }, [router])

    useEffect(() => {
        if (isAdmin) {
            fetchDbSize()
        }
    }, [isAdmin])

    const fetchDbSize = async () => {
        const { data, error } = await supabase.rpc('get_db_size')
        if (!error && data) setDbSize(data)
    }

    const fetchUsers = async () => {
        try {
            const res = await getUsers()
            if (res.success && res.users) {
                setUsers(res.users)
            } else {
                console.error('Failed to fetch users:', res.error)
                // Don't block UI on user fetch fail, just show empty
            }
        } catch (e) {
            console.error('Fetch Users Exception:', e)
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreateStatus('loading')
        setErrorMessage('')

        try {
            const res = await createUser(newUserEmail, newUserPassword)

            if (res.success) {
                setCreateStatus('success')
                setNewUserEmail('')
                setNewUserPassword('')
                // Refresh list
                await fetchUsers()
                setTimeout(() => setCreateStatus('idle'), 3000)
            } else {
                setCreateStatus('error')
                setErrorMessage(res.error || 'Fehler beim Erstellen.')
            }
        } catch (e: any) {
            setCreateStatus('error')
            setErrorMessage(e.message || 'Ausnahmefehler')
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        localStorage.clear() // Clear all local storage
        sessionStorage.clear()
        window.location.href = '/' // Force full reload to clear any state
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f8f5e6] flex flex-col gap-4 items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-black" />
                <p className="text-gray-500 font-bold animate-pulse">Lade Admin-Bereich...</p>
                <button
                    onClick={handleLogout}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200 transition-colors"
                >
                    Notfall Logout
                </button>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#f8f5e6] flex flex-col gap-4 items-center justify-center p-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <h1 className="text-xl font-bold">Admin Zugriff Fehler</h1>
                <p className="text-gray-600 bg-white p-4 rounded-xl shadow-sm border border-red-100">{error}</p>
                <div className="flex gap-4">
                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-black text-white rounded-lg">Neu laden</button>
                    <button onClick={() => router.replace('/')} className="px-4 py-2 bg-gray-200 rounded-lg">Zurück Startseite</button>
                    <button onClick={handleLogout} className="px-4 py-2 text-red-500 underline">Logout</button>
                </div>
            </div>
        )
    }

    if (!isAdmin) return null

    return (
        <div className="min-h-screen bg-[#f8f5e6] p-4 md:p-8 font-['Patrick_Hand'] text-[#333]">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-2">
                            <ShieldAlert className="w-8 h-8 text-red-500" />
                            Master Control
                        </h1>
                        <p className="text-xl font-bold text-black mt-1">Willkommen zurück Meister Anton !!!</p>
                        <p className="text-gray-500 text-sm mt-1">Verwaltung aller Accounts</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => router.push('/admin/db-structure')}
                            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#333] rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            <div className="w-4 h-4 rounded-full border-2 border-purple-600"></div>
                            DB Struktur
                        </button>
                        <button
                            onClick={() => router.push('/admin/calculations')}
                            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#333] rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            <Calculator className="w-4 h-4 text-green-600" />
                            Analytik
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#333] rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>

                {/* DB Usage Card */}
                <div className="bg-white rounded-[20px] p-6 shadow-sm border border-gray-100 mb-8 relative overflow-hidden">
                    <div className="flex justify-between items-end mb-2 relative z-10">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <span className="text-2xl">💾</span> Speicherplatz
                            </h2>
                            <p className="text-sm text-gray-500">Supabase Limit: 500 MB</p>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold">
                                {Math.round((dbSize / 1024 / 1024) * 100) / 100} MB
                            </div>
                            <div className={`text-sm font-bold ${(dbSize / 1024 / 1024) > 450 ? 'text-red-500' : 'text-green-500'}`}>
                                {Math.round((dbSize / (500 * 1024 * 1024)) * 100)}% Verbraucht
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden relative z-10">
                        <div
                            className={`h-full transition-all duration-1000 ${(dbSize / (500 * 1024 * 1024)) > 0.9 ? 'bg-red-500' :
                                (dbSize / (500 * 1024 * 1024)) > 0.7 ? 'bg-orange-500' : 'bg-green-500'
                                }`}
                            style={{ width: `${Math.min(100, Math.round((dbSize / (500 * 1024 * 1024)) * 100))}%` }}
                        ></div>
                    </div>

                    {/* Background Pattern */}
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <Calculator className="w-32 h-32" />
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">

                    {/* LEFT COLUMN: User List */}
                    <div className="bg-white rounded-[20px] p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-500" />
                            Vorhandene User ({users.length})
                        </h2>

                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                            {users.map((user) => (
                                <div key={user.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col relative group">
                                    <span className="font-bold text-lg">{user.email}</span>
                                    <span className="text-xs text-gray-400 font-mono mt-1">ID: {user.id}</span>
                                    <span className="text-xs text-gray-400">Erstellt: {new Date(user.created_at).toLocaleDateString()}</span>

                                    {/* Action Buttons */}
                                    {user.email !== ADMIN_EMAIL && (
                                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                                            {/* Reset Button */}
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm(`WIRKLICH ALLES AUF 0 SETZEN für ${user.email}? Der User bleibt erhalten, aber alle Daten sind weg!`)) {
                                                        const res = await resetUser(user.id)
                                                        if (res.success) {
                                                            alert(`User ${user.email} wurde erfolgreich zurückgesetzt!`)
                                                            await fetchUsers()
                                                        } else {
                                                            alert('Fehler beim Zurücksetzen: ' + res.error)
                                                        }
                                                    }
                                                }}
                                                className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                                title="User zurücksetzen (Daten löschen)"
                                            >
                                                <RefreshCcw className="w-4 h-4" />
                                            </button>

                                            {/* Delete Button */}
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm(`Sicher? ALLE DATEN von ${user.email} werden unwiderruflich gelöscht!`)) {
                                                        const res = await deleteUser(user.id)
                                                        if (res.success) {
                                                            await fetchUsers()
                                                        } else {
                                                            alert('Fehler beim Löschen: ' + res.error)
                                                        }
                                                    }
                                                }}
                                                className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                                title="User & Daten löschen"
                                            >
                                                <div className="w-4 h-4 font-bold flex items-center justify-center">X</div>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Add User */}
                    <div className="bg-white rounded-[20px] p-6 shadow-sm border border-gray-100 h-fit">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-green-500" />
                            Neuen User anlegen
                        </h2>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="neu@anton.de"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1">Passwort</label>
                                <input
                                    type="password"
                                    required
                                    value={newUserPassword}
                                    onChange={(e) => setNewUserPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="Mindestens 6 Zeichen"
                                    minLength={6}
                                />
                            </div>

                            {createStatus === 'error' && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm">
                                    {errorMessage}
                                </div>
                            )}

                            {createStatus === 'success' && (
                                <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm flex items-center gap-2">
                                    <Check className="w-4 h-4" /> User erfolgreich angelegt!
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={createStatus === 'loading'}
                                className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                                {createStatus === 'loading' && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                                User erstellen
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    )
}

