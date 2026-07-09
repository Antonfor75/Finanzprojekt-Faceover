'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase'
import MobileDashboard from '@/components/MobileDashboard'
import LoginScreen from '@/components/LoginScreen'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Expense, FixedCost, Settings, Account, IncomeSource } from '@/app/types'

export default function Home() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [data, setData] = useState<{
    expenses: Expense[],
    monthlyBudget: number,
    fixedCosts: FixedCost[],
    settings: Settings,
    accounts: Account[],
    incomeSources: IncomeSource[]
  } | null>(null)

  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1. AUTH & SESSION
  useEffect(() => {
    let mounted = true

    // Timeout safety for Auth check (max 5 seconds)
    const authTimeout = setTimeout(() => {
      if (mounted && authLoading) {
        setAuthLoading(false)
        setError("Authentifizierung dauert zu lange. Bitte Seite neu laden.")
      }
    }, 5000)

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) {
        console.error("Auth Session Error:", error)
        setError("Fehler beim Laden der Sitzung: " + error.message)
      }
      setSession(session)
      setAuthLoading(false)
      clearTimeout(authTimeout)
    }).catch(err => {
      if (!mounted) return
      console.error("Auth Promise Error:", err)
      setError("Unerwarteter Fehler bei der Authentifizierung.")
      setAuthLoading(false)
      clearTimeout(authTimeout)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setAuthLoading(false)
      if (!session) {
        setData(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(authTimeout)
    }
  }, [])

  // Admin Redirect
  useEffect(() => {
    if (session?.user?.email === 'chef@anton.de') {
      router.replace('/admin')
    }
  }, [session, router])

  // 2. DATA FETCHING
  const fetchData = async () => {
    if (!session) return
    setDataLoading(true)
    setError(null)

    try {
      const { user } = session
      // Explicitly checking for user to satisfy Typescript if needed, though session implies it
      if (!user) throw new Error("No user found in session")

      const [expensesRes, fixedCostsRes, accountsRes, settingsRes, incomeSourcesRes] = await Promise.all([
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('fixed_costs').select('*'),
        supabase.from('accounts').select('*'),
        supabase.from('settings').select('*').single(),
        supabase.from('income_sources').select('*')
      ])

      if (expensesRes.error) throw new Error("Expenses: " + expensesRes.error.message)
      if (fixedCostsRes.error) throw new Error("Fixed Costs: " + fixedCostsRes.error.message)
      // Settings might be missing (error code PGRST116), handle separately below

      const settingsObj = settingsRes.data
      const fixedCostsList = fixedCostsRes.data || []
      const accountsList = accountsRes.data || []
      const incomeSourcesList = incomeSourcesRes.data || []

      // Create default settings if missing
      let finalSettings = settingsObj
      if (!settingsObj && settingsRes.error && settingsRes.error.code === 'PGRST116') {
        const { data: newSettings, error: createError } = await supabase
          .from('settings')
          .insert([{ monthly_budget: 0, user_id: user.id }])
          .select()
          .single()

        if (createError) {
          // Fallback purely client-side if DB insert fails
          console.error("Failed to create settings:", createError)
          finalSettings = { monthly_budget: 0, savings_balance: 0, savings_months_remaining: 0, id: 0, last_processed_month: null, user_id: user.id }
        } else {
          finalSettings = newSettings
        }
      } else if (settingsRes.error && settingsRes.error.code !== 'PGRST116') {
        // Real error reading settings
        throw new Error("Settings Load: " + settingsRes.error.message)
      }

      if (!finalSettings) {
        // Ultimate fallback
        finalSettings = { monthly_budget: 0, savings_balance: 0, savings_months_remaining: 0, id: 0, last_processed_month: null, user_id: user.id }
      }

      // Calculate Total Budget: Sum of Income Sources + Distributed Accounts
      const totalIncome = incomeSourcesList.reduce((sum: number, src: any) => sum + Number(src.amount), 0)
      const baseBudget = totalIncome || 0

      const accountDistributions = accountsList.reduce((sum: number, acc: Account) => {
        if (acc.type === 'distribution' && acc.months > 0 && acc.amount > 0) {
          return sum + (acc.amount / acc.months)
        }
        return sum
      }, 0)

      const monthlyBudget = baseBudget + accountDistributions

      setData({
        expenses: expensesRes.data || [],
        monthlyBudget,
        fixedCosts: fixedCostsList,
        settings: finalSettings,
        accounts: accountsList,
        incomeSources: incomeSourcesList
      })
    } catch (err: any) {
      console.error("Failed to load data", err)
      setError("Daten konnten nicht geladen werden: " + (err.message || "Unbekannter Fehler"))
    } finally {
      setDataLoading(false)
    }
  }

  // Trigger Fetch
  useEffect(() => {
    if (session && !data && !dataLoading && session.user.email !== 'chef@anton.de') {
      fetchData()
    }
  }, [session, data]) // Removed dataLoading from dep array to avoid loops, handled inside

  // LOADING STATE (Auth or Initial Data)
  const isLoading = authLoading || (session && dataLoading && !data)

  const AnimatedBackground = () => (
    <>
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[var(--blob-color-1)] rounded-full mix-blend-multiply filter blur-3xl opacity-20 pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[var(--blob-color-2)] rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none"></div>
        <div className="absolute top-[20%] right-[10%] w-[30vw] h-[30vw] bg-[var(--blob-color-3)] rounded-full mix-blend-overlay filter blur-2xl opacity-50 pointer-events-none"></div>
    </>
  )

  if (isLoading && !error) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden gap-6">
        <AnimatedBackground />
        <div className="z-10 bg-white/50 p-6 rounded-[2rem] backdrop-blur-md shadow-sm border border-white/60">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
        <p className="z-10 text-foreground uppercase tracking-widest font-light text-sm animate-pulse">Lade Finanzen...</p>
      </div>
    )
  }

  // ERROR STATE
  if (error) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden p-6 text-center">
        <AnimatedBackground />
        
        <div className="z-10 flex flex-col items-center max-w-sm">
            <div className="bg-white/50 p-6 rounded-[2rem] backdrop-blur-md shadow-sm border border-white/60 mb-6">
                <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-2xl font-light tracking-widest uppercase text-foreground mb-4">Fehler</h2>
            <p className="text-muted-foreground bg-white/70 backdrop-blur-xl p-6 rounded-[2rem] border border-white/60 shadow-sm mb-8">
            {error}
            </p>
            <Button
                onClick={() => window.location.reload()}
                className="w-full bg-primary text-primary-foreground p-6 rounded-full font-bold text-lg hover:opacity-90 active:scale-[0.98] transition-transform duration-300 active:duration-75 ease-out shadow-md mb-4"
            >
                Erneut versuchen
            </Button>
            <Button
                variant="ghost"
                onClick={() => { supabase.auth.signOut(); window.location.reload() }}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors duration-200 ease-out rounded-full"
            >
                Ausloggen
            </Button>
        </div>
      </div>
    )
  }

  // ADMIN REDIRECT PLACEHOLDER
  if (session?.user?.email === 'chef@anton.de') {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-background relative overflow-hidden">
        <AnimatedBackground />
        <Loader2 className="w-10 h-10 animate-spin text-primary z-10" />
      </div>
    )
  }

  // LOGIN SCREEN
  if (!session) {
    return <LoginScreen />
  }

  // AUTHENTICATED APP
  return (
    <main className="h-[100dvh] w-full bg-background relative overflow-hidden">
      <AnimatedBackground />
      <div className="absolute inset-0 z-10">
          <MobileDashboard
            expenses={data?.expenses || []}
            initialBudget={data?.monthlyBudget || 0}
            initialFixedCosts={data?.fixedCosts || []}
            initialSettings={data?.settings!}
            initialAccounts={data?.accounts || []}
            initialIncomeSources={data?.incomeSources || []}
            onUpdate={fetchData}
          />
      </div>
    </main>
  )
}
