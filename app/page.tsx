'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'
import MobileDashboard from '@/components/MobileDashboard'
import LoginScreen from '@/components/LoginScreen'
import { Loader2 } from 'lucide-react'
import { Expense, FixedCost, Settings, Account } from '@/app/types'



export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [data, setData] = useState<{
    expenses: Expense[],
    monthlyBudget: number,
    fixedCosts: FixedCost[],
    settings: Settings,
    accounts: Account[]
  } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)

  // 1. AUTH & SESSION
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setAuthLoading(false)
      // If logged out, reset data
      if (!session) {
        setData(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // 2. DATA FETCHING
  const fetchData = async () => {
    setDataLoading(true)
    try {
      const [expensesRes, fixedCostsRes, accountsRes, settingsRes] = await Promise.all([
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('fixed_costs').select('*'),
        supabase.from('accounts').select('*'),
        supabase.from('settings').select('*').single()
      ])

      const settingsObj = settingsRes.data
      const fixedCostsList = fixedCostsRes.data || []
      const accountsList = accountsRes.data || []

      // Create default settings if missing
      let finalSettings = settingsObj
      if (!settingsObj && settingsRes.error && settingsRes.error.code === 'PGRST116') {
        const { data: newSettings } = await supabase
          .from('settings')
          .insert([{ monthly_budget: 0 }])
          .select()
          .single()
        finalSettings = newSettings
      }

      if (!finalSettings) {
        // Fallback dummy object if creation failed or something else went wrong
        finalSettings = { monthly_budget: 0, savings_balance: 0, savings_months_remaining: 0, id: 0, last_processed_month: null }
      }

      // Calculate Total Budget: Base (Settings) + Distributed Accounts
      const baseBudget = finalSettings.monthly_budget || 0

      const accountDistributions = accountsList.reduce((sum: number, acc: Account) => {
        if (acc.type === 'distribution' && acc.months > 0 && acc.amount > 0) {
          return sum + (acc.amount / acc.months)
        }
        return sum
      }, 0)

      const monthlyBudget = baseBudget + accountDistributions

      setData({
        expenses: expensesRes.data || [],
        monthlyBudget, // Passing the computed total
        fixedCosts: fixedCostsList,
        settings: finalSettings,
        accounts: accountsList
      })
    } catch (error) {
      console.error("Failed to load data", error)
    } finally {
      setDataLoading(false)
    }
  }

  // Trigger Fetch
  useEffect(() => {
    if (session && !data) {
      fetchData()
    }
  }, [session, data])

  // LOADING STATE (Auth or Initial Data)
  if (authLoading || (session && dataLoading && !data)) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-[#f8f5e6]">
        <Loader2 className="w-10 h-10 animate-spin text-black" />
      </div>
    )
  }

  // LOGIN GUARD
  if (!session) {
    return <LoginScreen />
  }

  // AUTHENTICATED APP
  return (
    <main className="h-[100dvh] w-full bg-white">
      <MobileDashboard
        expenses={data?.expenses || []}
        initialBudget={data?.monthlyBudget || 0}
        initialFixedCosts={data?.fixedCosts || []}
        initialSettings={data?.settings!}
        initialAccounts={data?.accounts || []}
        onUpdate={fetchData}
      />
    </main>
  )
}