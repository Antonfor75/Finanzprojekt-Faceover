import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { deletionRequestedAt, isDueForPurge } from '@/utils/accountDeletion'
import { purgeAccount } from '@/lib/accountPurge'

/**
 * Täglicher Lauf (vercel.json): löscht Konten endgültig, deren Löschfrist (30 Tage seit
 * "Konto löschen") abgelaufen ist. Vercel ruft die Route mit "Authorization: Bearer <CRON_SECRET>"
 * auf; ohne gesetztes CRON_SECRET oder bei falschem Wert passiert nichts.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PAGE_SIZE = 1000
const MAX_PAGES = 50

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Nicht erlaubt.' }, { status: 401 })
    }

    const now = new Date()
    const due: string[] = []
    let waiting = 0
    for (let page = 1; page <= MAX_PAGES; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        for (const user of data.users) {
            const requestedAt = deletionRequestedAt(user)
            if (!requestedAt) continue
            if (isDueForPurge(requestedAt, now)) due.push(user.id)
            else waiting++
        }
        if (data.users.length < PAGE_SIZE) break
    }

    let purged = 0
    const failed: string[] = []
    for (const id of due) {
        try {
            await purgeAccount(id)
            purged++
        } catch (err) {
            console.error('Endgültig löschen fehlgeschlagen:', id, err)
            failed.push(id)
        }
    }
    return NextResponse.json({ purged, waiting, failed: failed.length })
}
