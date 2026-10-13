'use server'

import { createClient } from '@/utils/supabase/server'
import { processWeeklySavings } from './savings'
import { processFunAccountFeeds } from './funAccount'
import { processMonthlyDistributions } from '@/utils/distributions'

/**
 * Hintergrund-Jobs beim Öffnen des Dashboards in EINER Server-Anfrage statt
 * 5–6 Abfragen nacheinander aus dem Browser. Reihenfolge und Regeln wie bisher:
 * 1. Wochensparen ("Sunday Logic"), 2. Spaßkonto-Feeds, 3. Verteilkonten.
 * `changed` sagt dem Dashboard, ob es die Daten neu laden muss.
 */
export async function runStartupJobs(): Promise<{ changed: boolean }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { changed: false }

    await processWeeklySavings(user.id)

    const feedResult = await processFunAccountFeeds()

    const distributed = await processMonthlyDistributions(supabase)

    return { changed: feedResult.credited > 0 || distributed }
}
