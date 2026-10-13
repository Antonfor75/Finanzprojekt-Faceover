'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'
import { FixedCost } from '@/app/types'

/** Fixkosten: Eingaben für neue/bearbeitete Posten und die Speicher-Aktionen.
 * Aus SettingsOverlay.tsx herausgelöst; der Zustand lebt weiter im SettingsOverlay
 * (Eingaben bleiben also wie bisher erhalten, wenn man den Bereich verlässt). */
export function useFixedCostEditor(fixedCosts: FixedCost[], onUpdate?: () => void) {
    const [newCostTitle, setNewCostTitle] = useState('')
    const [newCostAmount, setNewCostAmount] = useState('')
    const [newCostValidFrom, setNewCostValidFrom] = useState('')
    const [newCostValidTo, setNewCostValidTo] = useState('')
    // const [newCostAccountId, setNewCostAccountId] = useState<number | null>(null) // REMOVED

    const handleAddCost = async () => {
        if (!newCostTitle || !newCostAmount) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { alert('Nicht eingeloggt'); return }

        const { error } = await supabase.from('fixed_costs').insert([{
            title: newCostTitle,
            amount: Number(newCostAmount),
            valid_from: newCostValidFrom ? new Date(newCostValidFrom).toISOString() : new Date().toISOString(),
            valid_to: newCostValidTo ? new Date(newCostValidTo).toISOString() : null,
            // account_id: newCostAccountId, // REMOVED
            user_id: user.id
        }])
        if (error) {
            console.error(error)
            alert('Fehler beim Speichern: ' + error.message)
        }
        else onUpdate?.()
        setNewCostTitle('')
        setNewCostAmount('')
        setNewCostValidFrom('')
        setNewCostValidTo('')
        // setNewCostAccountId(null)
    }

    const [editingCostId, setEditingCostId] = useState<number | null>(null)
    const [editCostTitle, setEditCostTitle] = useState('')
    const [editCostAmount, setEditCostAmount] = useState('')
    const [editCostValidFrom, setEditCostValidFrom] = useState('')
    const [editCostValidTo, setEditCostValidTo] = useState('')

    const handleStartEditCost = (cost: FixedCost) => {
        setEditingCostId(cost.id)
        setEditCostTitle(cost.title)
        setEditCostAmount(cost.amount.toString())
        setEditCostValidFrom(cost.valid_from ? new Date(cost.valid_from).toISOString().split('T')[0] : '')
        setEditCostValidTo(cost.valid_to ? new Date(cost.valid_to).toISOString().split('T')[0] : '')
    }

    const handleSaveEditCost = async () => {
        if (!editingCostId || !editCostTitle || !editCostAmount) return

        const { error } = await supabase.from('fixed_costs').update({
            title: editCostTitle,
            amount: Number(editCostAmount),
            valid_from: editCostValidFrom ? new Date(editCostValidFrom).toISOString() : new Date().toISOString(),
            valid_to: editCostValidTo ? new Date(editCostValidTo).toISOString() : null,
        }).eq('id', editingCostId)

        if (error) {
            console.error(error)
            alert('Fehler beim Speichern')
        } else {
            onUpdate?.()
            setEditingCostId(null)
        }
    }

    const handleDeleteCost = async (id: number) => {
        // Check if it's a linked cost (from Savings)
        const cost = fixedCosts.find(c => c.id === id)
        if (cost?.linked_account_id) {
            if (!confirm('Dieser Fixkosten-Eintrag ist mit einem Sparkonto verknüpft. Möchtest du ihn wirklich löschen? Dies stoppt die automatische Sparrate (das Konto bleibt erhalten).')) {
                return
            }
            // Optional: Remove link from account? Or just let it be.
        }

        const { error } = await supabase.from('fixed_costs').delete().eq('id', id)
        if (error) console.error(error)
        else onUpdate?.()
    }

    return {
        newCostTitle,
        setNewCostTitle,
        newCostAmount,
        setNewCostAmount,
        newCostValidFrom,
        setNewCostValidFrom,
        newCostValidTo,
        setNewCostValidTo,
        handleAddCost,
        editingCostId,
        setEditingCostId,
        editCostTitle,
        setEditCostTitle,
        editCostAmount,
        setEditCostAmount,
        editCostValidFrom,
        setEditCostValidFrom,
        editCostValidTo,
        setEditCostValidTo,
        handleStartEditCost,
        handleSaveEditCost,
        handleDeleteCost,
    }
}

export type FixedCostEditorState = ReturnType<typeof useFixedCostEditor>
