import { createClient } from '@/utils/supabase/server'

// Muss identisch zur Prüfung in app/page.tsx und app/admin/page.tsx bleiben.
export const ADMIN_EMAIL = 'chef@anton.de'

/**
 * Wirft, wenn der Aufrufer nicht der Admin ist. Prüft die echte Session aus dem
 * Cookie — Server Actions sind öffentliche HTTP-Endpunkte, die clientseitige
 * Weiterleitung im Admin-Bereich ist also kein Zugriffsschutz.
 */
export async function assertAdmin(): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user || user.email !== ADMIN_EMAIL) {
        throw new Error('Kein Zugriff — nur der Admin darf das.')
    }
}
