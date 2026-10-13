'use client'

import { useState, useMemo } from 'react'
import { supabase } from '@/utils/supabase'
import { addFunAccount, setFunAccountFeed } from '@/lib/data/actions'
import { FixedCost, Account } from '@/app/types'

/** Konten (Verteil-, Spar-, Spaßkonten): Eingaben, Sparraten-Vorschau und Speicher-Aktionen.
 * Aus SettingsOverlay.tsx herausgelöst; der Zustand lebt weiter im SettingsOverlay
 * (Eingaben bleiben also wie bisher erhalten, wenn man den Bereich verlässt). */
export function useAccountEditor(accounts: Account[], fixedCosts: FixedCost[], onUpdate?: () => void) {
    const [newAccountName, setNewAccountName] = useState('')
    const [newAccountAmount, setNewAccountAmount] = useState('') // Current Amount
    const [newAccountStartAmount, setNewAccountStartAmount] = useState('') // Initial Amount (for savings)
    const [newAccountTargetAmount, setNewAccountTargetAmount] = useState('') // Target Amount
    const [newAccountTargetDate, setNewAccountTargetDate] = useState('') // Target Date
    const [newAccountMonths, setNewAccountMonths] = useState('') // For distribution
    const [newAccountType, setNewAccountType] = useState<'distribution' | 'savings' | 'fun'>('distribution')
    const [newAccountFeed, setNewAccountFeed] = useState('') // Monthly feed for fun accounts
    const [newAccountValidFrom, setNewAccountValidFrom] = useState(new Date().toISOString().split('T')[0]) // Start Date for distribution

    // Derived Weekly Rate for Savings (Display Only during creation)
    const calculatedWeeklyRate = useMemo(() => {
        if (newAccountType !== 'savings' || !newAccountTargetAmount || !newAccountTargetDate || !newAccountAmount) return null

        const target = Number(newAccountTargetAmount)
        const targetDate = new Date(newAccountTargetDate)
        const now = new Date()

        if (targetDate <= now) return 0

        // FIXED: STRICTLY STATIC CALCULATION
        // Formula: (Target - StartAmount) / TotalMonths
        // We assume StartAmount = 0 for new accounts unless specified (user didn't ask for start amount input).
        // If user wants 12000 in 24 months, it MUST be 500.

        const startDate = newAccountValidFrom ? new Date(newAccountValidFrom) : new Date()

        // Calculate weeks between Start and Target
        const diffTime = Math.abs(targetDate.getTime() - startDate.getTime())
        const totalWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7))

        if (totalWeeks <= 0) return 0

        // Calculation: Target / Weeks
        return target / totalWeeks
    }, [newAccountType, newAccountTargetAmount, newAccountTargetDate, newAccountValidFrom, newAccountAmount])

    const handleAddAccount = async () => {
        if (!newAccountName || !newAccountAmount) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        if (newAccountType === 'fun') {
            const result = await addFunAccount(
                newAccountName,
                Number(newAccountAmount),
                newAccountFeed ? Number(newAccountFeed) : null
            )
            if (!result.success) {
                alert(result.error || 'Fehler beim Anlegen')
                return
            }
            onUpdate?.()
            setNewAccountName('')
            setNewAccountAmount('')
            setNewAccountFeed('')
            return
        }

        let months = 0
        let accountData: any = {
            name: newAccountName,
            amount: Number(newAccountAmount),
            type: newAccountType,
            valid_from: newAccountValidFrom ? new Date(newAccountValidFrom).toISOString() : null,
            user_id: user.id
        }

        if (newAccountType === 'distribution') {
            months = Number(newAccountMonths)
            accountData.months = months
        } else {
            // Savings Logic
            // accountData.start_amount = newAccountStartAmount ? Number(newAccountStartAmount) : Number(newAccountAmount) // REMOVED
            accountData.target_amount = newAccountTargetAmount ? Number(newAccountTargetAmount) : null
            accountData.target_date = newAccountTargetDate ? new Date(newAccountTargetDate).toISOString() : null
            accountData.months = 0 // Irrelevant for savings
        }

        // 1. Create Account
        const { data: newAccount, error } = await supabase.from('accounts').insert([accountData]).select().single()

        if (error) {
            console.error(error)
            return
        }

        if (newAccountType === 'savings' && calculatedWeeklyRate && calculatedWeeklyRate > 0) {
            const { error: fcError } = await supabase.from('fixed_costs').insert([{
                title: `Sparziel: ${newAccountName}`,
                amount: calculatedWeeklyRate * 4.33,
                valid_from: newAccountValidFrom ? new Date(newAccountValidFrom).toISOString() : new Date().toISOString(),
                valid_to: newAccountTargetDate ? new Date(newAccountTargetDate).toISOString() : null,
                linked_account_id: newAccount.id,
                user_id: user.id
            }])
            if (fcError) console.error('Error creating linked fixed cost:', fcError)
        }

        onUpdate?.()
        setNewAccountName('')
        setNewAccountAmount('')
        setNewAccountMonths('')
        setNewAccountTargetAmount('')
        setNewAccountTargetDate('')
        setNewAccountStartAmount('')
        setNewAccountValidFrom(new Date().toISOString().split('T')[0])
    }

    const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
    const [editAccountName, setEditAccountName] = useState('')
    const [editAccountAmount, setEditAccountAmount] = useState('')
    const [editAccountTargetAmount, setEditAccountTargetAmount] = useState('')
    const [editAccountTargetDate, setEditAccountTargetDate] = useState('')
    const [editAccountMonths, setEditAccountMonths] = useState('')
    const [editAccountValidFrom, setEditAccountValidFrom] = useState('')
    const [editAccountFeed, setEditAccountFeed] = useState('') // Monthly feed for fun accounts

    const handleStartEditAccount = (acc: Account) => {
        setEditingAccountId(acc.id)
        setEditAccountName(acc.name)
        setEditAccountAmount(acc.amount.toString())
        setEditAccountTargetAmount(acc.target_amount ? acc.target_amount.toString() : '')
        setEditAccountTargetDate(acc.target_date ? new Date(acc.target_date).toISOString().split('T')[0] : '')
        setEditAccountMonths(acc.months ? acc.months.toString() : '')
        setEditAccountValidFrom(acc.valid_from ? new Date(acc.valid_from).toISOString().split('T')[0] : '')
        const feedCost = fixedCosts.find(fc => fc.linked_account_id === acc.id)
        setEditAccountFeed(acc.type === 'fun' && feedCost ? Number(feedCost.amount).toString() : '')
    }

    const handleSaveEditAccount = async () => {
        if (!editingAccountId || !editAccountName || !editAccountAmount) return

        const currentAccount = accounts.find(a => a.id === editingAccountId)
        if (!currentAccount) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        let updates: any = {
            name: editAccountName,
            amount: Number(editAccountAmount),
            valid_from: editAccountValidFrom ? new Date(editAccountValidFrom).toISOString() : null
        }

        if (currentAccount.type === 'distribution') {
            updates.months = Number(editAccountMonths)
        } else if (currentAccount.type === 'savings') {
            updates.target_amount = editAccountTargetAmount ? Number(editAccountTargetAmount) : null
            updates.target_date = editAccountTargetDate ? new Date(editAccountTargetDate).toISOString() : null
        }

        // 1. Update Account
        const { error } = await supabase.from('accounts').update(updates).eq('id', editingAccountId)
        if (error) {
            console.error(error)
            alert('Fehler beim Speichern')
            return
        }

        // 2b. Sync monthly feed (if Fun Account)
        if (currentAccount.type === 'fun') {
            const result = await setFunAccountFeed(editingAccountId, editAccountFeed ? Number(editAccountFeed) : null)
            if (!result.success) console.error('Error syncing fun account feed:', result.error)
        }

        // 2. Sync Linked Fixed Cost (if Savings)
        if (currentAccount.type === 'savings') {
            const target = updates.target_amount
            const date = updates.target_date
            const current = updates.amount

            // Calculate new rate
            let newRate = 0
            if (target && date) {
                const targetDate = new Date(date)
                const now = new Date()
                if (targetDate > now) {
                    // FIXED: Use Total Duration (valid_from to target_date)
                    const startDate = updates.valid_from ? new Date(updates.valid_from) : (currentAccount.valid_from ? new Date(currentAccount.valid_from) : new Date())
                    const totalDiffTime = Math.abs(targetDate.getTime() - startDate.getTime())
                    const totalWeeks = Math.ceil(totalDiffTime / (1000 * 60 * 60 * 24 * 7))

                    // Logic: (Target - StartAmount) / TotalWeeks
                    // Since we don't strictly track StartAmount in historical data, we use:
                    // (Target) / TotalWeeks -> This assumes 0 start. 
                    // OR if we assume the current Amount was the start amount? No, that changes.
                    // We will stick to the User Request: (Zielbetrag - Startbetrag) / Gesamtlaufzeit. 
                    // As we lack Startbetrag, and "current" might be low (bad saver), using Target/TotalWeeks is the safest "Static Plan".
                    // If user wants to account for existing funds, they should lower the Target Amount.

                    if (totalWeeks > 0) {
                        // FIXED: STRICT FORMULA request by user
                        // (Target - Start) / TotalWeeks
                        // We do NOT use current account amount because that includes savings made.
                        // We assume start amount is 0 if not tracked.
                        newRate = target / totalWeeks
                    }
                }
            }

            // Update or Delete existing linked cost
            if (newRate > 0) {
                // Check if exists
                const existing = fixedCosts.find(fc => fc.linked_account_id === editingAccountId)
                const costData = {
                    title: `Sparziel: ${editAccountName}`,
                    amount: newRate * 4.33,
                    valid_to: date,
                    linked_account_id: editingAccountId,
                    user_id: user.id
                }

                if (existing) {
                    const { error } = await supabase.from('fixed_costs').update(costData).eq('id', existing.id)
                    if (error) console.error('Error updating linked cost', error)
                } else {
                    const { error } = await supabase.from('fixed_costs').insert([{ ...costData, valid_from: updates.valid_from || new Date().toISOString() }])
                    if (error) console.error('Error creating linked cost', error)
                }
            } else {
                // If no rate/target anymore, remove linked cost
                const { error } = await supabase.from('fixed_costs').delete().eq('linked_account_id', editingAccountId)
                if (error) console.error('Error removing linked cost', error)
            }
        }

        onUpdate?.()
        setEditingAccountId(null)
    }

    const handleDeleteAccount = async (id: number) => {
        if (!confirm('Möchtest du dieses Konto wirklich löschen?')) return

        const { error } = await supabase
            .from('accounts')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting account:', error)
        } else {
            // Also delete linked fixed costs
            const { error: fcError } = await supabase.from('fixed_costs').delete().eq('linked_account_id', id)
            if (fcError) console.error('Error deleting linked fixed cost', fcError)

            // Also delete deposit history (fun accounts)
            const { error: txError } = await supabase.from('account_transactions').delete().eq('account_id', id)
            if (txError) console.error('Error deleting account transactions', txError)

            onUpdate?.()
        }
    }

    const handleTransferFromSavings = async (acc: Account) => {
        const amountStr = prompt(`Geld von "${acc.name}" zum Budget hinzufügen? Betrag eingeben:`)
        if (!amountStr) return
        const amount = parseFloat(amountStr)
        if (isNaN(amount) || amount <= 0) return

        if (acc.amount < amount) {
            alert('Nicht genügend Guthaben!')
            return
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        // 1. Deduct from Account
        const { error: accError } = await supabase
            .from('accounts')
            .update({ amount: acc.amount - amount })
            .eq('id', acc.id)

        if (accError) {
            console.error('Error updating account:', accError)
            return
        }

        // 2. Add "Negative Expense" (Income)
        const { error: expError } = await supabase
            .from('expenses')
            .insert([{
                description: `Transfer von ${acc.name}`,
                amount: -amount,
                expense_date: new Date().toISOString(),
                category: 'Sparen',
                user_id: user.id
            }])

        if (expError) console.error('Error adding transfer expense:', expError)

        onUpdate?.()
        onUpdate?.()
    }

    return {
        newAccountName,
        setNewAccountName,
        newAccountAmount,
        setNewAccountAmount,
        newAccountStartAmount,
        setNewAccountStartAmount,
        newAccountTargetAmount,
        setNewAccountTargetAmount,
        newAccountTargetDate,
        setNewAccountTargetDate,
        newAccountMonths,
        setNewAccountMonths,
        newAccountType,
        setNewAccountType,
        newAccountFeed,
        setNewAccountFeed,
        newAccountValidFrom,
        setNewAccountValidFrom,
        calculatedWeeklyRate,
        handleAddAccount,
        editingAccountId,
        setEditingAccountId,
        editAccountName,
        setEditAccountName,
        editAccountAmount,
        setEditAccountAmount,
        editAccountTargetAmount,
        setEditAccountTargetAmount,
        editAccountTargetDate,
        setEditAccountTargetDate,
        editAccountMonths,
        setEditAccountMonths,
        editAccountValidFrom,
        setEditAccountValidFrom,
        editAccountFeed,
        setEditAccountFeed,
        handleStartEditAccount,
        handleSaveEditAccount,
        handleDeleteAccount,
        handleTransferFromSavings,
    }
}

export type AccountEditorState = ReturnType<typeof useAccountEditor>
