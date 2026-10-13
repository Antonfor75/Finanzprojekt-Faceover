'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/utils/supabase'
import LoginScreen from '@/components/LoginScreen'
import PrivacyUpdateNotice from '@/components/legal/PrivacyUpdateNotice'
import { hasAcceptedCurrentPrivacy } from '@/lib/legal/operator'
import { calculateMonthlyBudget } from '@/utils/financeHelpers'
import { disableDemoMode } from '@/lib/data/mode'
import { Loader2 } from 'lucide-react'
import { Settings } from '@/app/types'
import { loadFunSummary } from '@/lib/data/funSummary'
import {
  type DashboardData, type RefreshScope,
  readCachedData, writeCachedData, clearCachedData,
} from '@/lib/data/dashboardData'

// Das Dashboard-Paket lädt parallel zur Anmeldung und zu den Supabase-Abfragen, statt
// vorher den Seitenstart zu blockieren. Der Ladezustand sieht aus wie "Lade Finanzen".
const loadDashboard = () => import('@/components/MobileDashboard')
const MobileDashboard = dynamic(loadDashboard, {
  ssr: false,
  loading: () => (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center gap-6">
      <Loader2 className="w-7 h-7 animate-spin text-primary" strokeWidth={1.75} />
      <p className="eyebrow">Lade Finanzen</p>
    </div>
  ),
})

export default function Home() {
  // Falls man per Client-Navigation aus der Demo hierher kommt: die echte App
  // läuft IMMER im Live-Modus — noch bevor irgendein Datenzugriff passiert.
  useState(() => disableDemoMode())
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  // Aktueller Stand für fetchData (läuft aus Closures, die älter sein können)
  const dataRef = useRef<DashboardData | null>(null)
  useEffect(() => { dataRef.current = data }, [data])
  // true, solange nur der zwischengespeicherte Stand vom letzten Öffnen angezeigt wird
  const showingCachedData = useRef(false)
  // Für welchen Nutzer schon geladen wurde (ein Ladevorgang pro Anmeldung)
  const loadedForUser = useRef<string | null>(null)
  // Bon-Artikel/Produkte: erst bei Bedarf laden (Historie/Analyse), danach mit aktualisieren
  const receiptsRequested = useRef(false)

  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1. AUTH & SESSION
  useEffect(() => {
    let mounted = true
    loadDashboard().catch(() => {}) // sofort mitladen; Fehler zeigt dynamic() beim Rendern

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
      if (!session && !error) clearCachedData()
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
        dataRef.current = null
        loadedForUser.current = null
        receiptsRequested.current = false
        // Abgemeldet: zwischengespeicherte Finanzdaten vom Gerät entfernen
        if (_event === 'SIGNED_OUT') clearCachedData()
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
  const loadReceiptsAndProducts = async () => {
    const [receiptItemsRes, productsRes] = await Promise.all([
      supabase.from('receipt_items').select('*'),
      supabase.from('products').select('*')
    ])
    // Artikel sind optionale Zusatzinfo — ein Fehler hier (z. B. Migration noch
    // nicht angewendet) darf die App nicht blockieren.
    if (receiptItemsRes.error) console.warn('Receipt Items:', receiptItemsRes.error.message)
    if (productsRes.error) console.warn('Products:', productsRes.error.message)
    return { receiptItems: receiptItemsRes.data || [], products: productsRes.data || [] }
  }

  const applyData = (userId: string, next: DashboardData) => {
    dataRef.current = next
    setData(next)
    writeCachedData(userId, next)
  }

  // Lädt alles neu — oder mit `scope` nur die Tabellen, die eine Änderung betrifft.
  const fetchData = async (scope?: RefreshScope[]) => {
    if (!session) return
    if (scope && dataRef.current && !showingCachedData.current) return refreshPartial(scope)

    setDataLoading(true)
    setError(null)

    try {
      const { user } = session
      // Explicitly checking for user to satisfy Typescript if needed, though session implies it
      if (!user) throw new Error("No user found in session")

      // Spaßkonto-Kacheln und (falls schon gebraucht) Bon-Artikel laufen parallel mit
      const funSummaryPromise = loadFunSummary().catch(err => { console.warn('Spaßkonto:', err); return null })
      const receiptsPromise = receiptsRequested.current ? loadReceiptsAndProducts() : null

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

      // Gleiche Formel wie in der Demo (utils/financeHelpers.ts)
      const monthlyBudget = calculateMonthlyBudget(incomeSourcesList, accountsList)

      const [funSummary, receipts] = await Promise.all([funSummaryPromise, receiptsPromise])

      showingCachedData.current = false
      applyData(user.id, {
        expenses: expensesRes.data || [],
        monthlyBudget,
        fixedCosts: fixedCostsList,
        settings: finalSettings as Settings,
        accounts: accountsList,
        incomeSources: incomeSourcesList,
        receiptItems: receipts?.receiptItems ?? dataRef.current?.receiptItems,
        products: receipts?.products ?? dataRef.current?.products,
        funSummary
      })
    } catch (err: any) {
      console.error("Failed to load data", err)
      if (showingCachedData.current) {
        // Kein Netz o. Ä.: der zwischengespeicherte Stand bleibt sichtbar statt der Fehlerseite
        console.warn('Zeige zwischengespeicherte Daten, Aktualisierung fehlgeschlagen')
      } else {
        setError("Daten konnten nicht geladen werden: " + (err.message || "Unbekannter Fehler"))
      }
    } finally {
      setDataLoading(false)
    }
  }

  // Nach einer Änderung nur die betroffenen Tabellen neu laden (statt aller)
  const refreshPartial = async (scope: RefreshScope[]) => {
    if (!session?.user) return
    try {
      const [expensesRes, accountsRes, receipts] = await Promise.all([
        scope.includes('expenses') ? supabase.from('expenses').select('*').order('created_at', { ascending: false }) : null,
        scope.includes('accounts') ? supabase.from('accounts').select('*') : null,
        scope.includes('receipts') && receiptsRequested.current ? loadReceiptsAndProducts() : null
      ])
      if (expensesRes?.error) throw new Error("Expenses: " + expensesRes.error.message)

      const current = dataRef.current
      if (!current) return
      const next: DashboardData = { ...current }
      if (expensesRes) next.expenses = expensesRes.data || []
      if (accountsRes) {
        next.accounts = accountsRes.data || []
        // Gleiche Formel wie beim vollständigen Laden
        next.monthlyBudget = calculateMonthlyBudget(current.incomeSources, next.accounts)
      }
      if (receipts) {
        next.receiptItems = receipts.receiptItems
        next.products = receipts.products
      }
      applyData(session.user.id, next)
    } catch (err) {
      console.error("Failed to load data", err)
      setError("Daten konnten nicht geladen werden: " + ((err instanceof Error && err.message) || "Unbekannter Fehler"))
    }
  }

  // Bon-Artikel/Produkte nachladen, sobald die Historie geöffnet wird
  const loadReceipts = useCallback(() => {
    if (receiptsRequested.current) return
    receiptsRequested.current = true
    loadReceiptsAndProducts()
      .catch(err => {
        console.warn('Receipt Items:', err)
        return { receiptItems: [], products: [] }
      })
      .then(({ receiptItems, products }) => {
        const current = dataRef.current
        if (!current) return
        const next = { ...current, receiptItems, products }
        dataRef.current = next
        setData(next)
      })
  }, [])

  // Trigger Fetch: einmal pro Anmeldung. Gibt es einen Stand vom letzten Öffnen, wird
  // der sofort angezeigt und im Hintergrund aktualisiert.
  useEffect(() => {
    if (!session || session.user.email === 'chef@anton.de') return
    if (loadedForUser.current === session.user.id) return
    loadedForUser.current = session.user.id
    if (!dataRef.current) {
      const cached = readCachedData(session.user.id)
      if (cached) {
        showingCachedData.current = true
        dataRef.current = cached
        setData(cached)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // LOADING STATE (Auth or Initial Data)
  const isLoading = authLoading || (session && dataLoading && !data)

  // Bewusst ein fertiges Element und keine im Render definierte Komponente: als
  // JSX-Tag gerendert saehe React bei jedem Rendern einen neuen Komponententyp und
  // wuerde das Element abhaengen und neu aufhaengen (Animation startet neu).
  const AnimatedBackground = <div className="ambient-bg" />

  if (isLoading && !error) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden gap-6 view-enter">
        {AnimatedBackground}

        <Loader2 className="z-10 w-7 h-7 animate-spin text-primary" strokeWidth={1.75} />
        <p className="z-10 eyebrow">Lade Finanzen</p>
      </div>
    )
  }

  // ERROR STATE
  if (error) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background relative overflow-hidden p-6 view-enter">
        {AnimatedBackground}

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
        {AnimatedBackground}
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
      {AnimatedBackground}
      <div className="absolute inset-0 z-10">
          <MobileDashboard
            expenses={data?.expenses || []}
            initialBudget={data?.monthlyBudget || 0}
            initialFixedCosts={data?.fixedCosts || []}
            initialSettings={data?.settings!}
            initialAccounts={data?.accounts || []}
            initialIncomeSources={data?.incomeSources || []}
            receiptItems={data?.receiptItems}
            products={data?.products}
            initialFunSummary={data ? data.funSummary : undefined}
            onNeedReceipts={loadReceipts}
            onUpdate={fetchData}
          />
      </div>
      {!hasAcceptedCurrentPrivacy(session.user?.user_metadata) && <PrivacyUpdateNotice />}
    </main>
  )
}
