'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase'
import MobileDashboard from '@/components/MobileDashboard'
import LoginScreen from '@/components/LoginScreen'
import { Loader2 } from 'lucide-react'
import { Expense, FixedCost, Settings, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'

export default function Home() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [data, setData] = useState<{
    expenses: Expense[],
    monthlyBudget: number,
    fixedCosts: FixedCost[],
    settings: Settings,
    accounts: Account[],
    incomeSources: IncomeSource[],
    receiptItems: ReceiptItem[],
    products: Product[]
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

      const [expensesRes, fixedCostsRes, accountsRes, settingsRes, incomeSourcesRes, receiptItemsRes, productsRes] = await Promise.all([
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('fixed_costs').select('*'),
        supabase.from('accounts').select('*'),
        supabase.from('settings').select('*').single(),
        supabase.from('income_sources').select('*'),
        supabase.from('receipt_items').select('*'),
        supabase.from('products').select('*')
      ])

      if (expensesRes.error) throw new Error("Expenses: " + expensesRes.error.message)
      if (fixedCostsRes.error) throw new Error("Fixed Costs: " + fixedCostsRes.error.message)
      // Settings might be missing (error code PGRST116), handle separately below

      const settingsObj = settingsRes.data
      const fixedCostsList = fixedCostsRes.data || []
      const accountsList = accountsRes.data || []
      const incomeSourcesList = incomeSourcesRes.data || []
      // Artikel sind optionale Zusatzinfo — ein Fehler hier (z. B. Migration noch
      // nicht angewendet) darf die App nicht blockieren.
      if (receiptItemsRes.error) console.warn('Receipt Items:', receiptItemsRes.error.message)
      const receiptItemsList = receiptItemsRes.data || []
      if (productsRes.error) console.warn('Products:', productsRes.error.message)
      const productsList = productsRes.data || []

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
        incomeSources: incomeSourcesList,
        receiptItems: receiptItemsList,
        products: productsList
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

  const AnimatedBackground = () => <div className="ambient-bg" />

  if (isLoading && !error) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden gap-6 view-enter">
        <AnimatedBackground />

        <Loader2 className="z-10 w-7 h-7 animate-spin text-primary" strokeWidth={1.75} />
        <p className="z-10 eyebrow">Lade Finanzen</p>
      </div>
    )
  }

  // ERROR STATE
  if (error) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden p-6 view-enter">
        <AnimatedBackground />

        <div className="z-10 flex flex-col w-full max-w-sm">

            <p className="eyebrow mb-3">Fehler</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground mb-4">
                Daten konnten nicht geladen werden
            </h2>

            <div className="surface p-5 mb-8">
                <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
            </div>

            <button
                onClick={() => window.location.reload()}
                className="press w-full bg-primary text-primary-foreground py-4 rounded-xl font-semibold text-base mb-3"
            >
                Erneut versuchen
            </button>
            <button
                onClick={() => { supabase.auth.signOut(); window.location.reload() }}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 py-2"
            >
                Abmelden
            </button>
        </div>
      </div>
    )
  }

  // ADMIN REDIRECT PLACEHOLDER
  if (session?.user?.email === 'chef@anton.de') {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-background relative overflow-hidden">
        <AnimatedBackground />
        <Loader2 className="w-7 h-7 animate-spin text-primary z-10" strokeWidth={1.75} />
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
            receiptItems={data?.receiptItems || []}
            products={data?.products || []}
            onUpdate={fetchData}
          />
      </div>
    </main>
  )
}
