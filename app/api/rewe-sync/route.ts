import { NextRequest, NextResponse } from 'next/server'
import { syncAllConnections } from '@/lib/reweSync'

/**
 * Geschützter Endpunkt für den automatischen REWE-Import.
 *
 * Wird vom Cron (z. B. Vercel Cron, siehe vercel.json) aufgerufen und kann zum
 * Testen auch manuell getriggert werden. Absicherung über CRON_SECRET, das als
 * `Authorization: Bearer <secret>` (so schickt es Vercel Cron) oder als
 * `?secret=<secret>` übergeben wird.
 *
 * IMAP + pdfjs brauchen Node-APIs → Node-Runtime, nicht Edge.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false // Ohne konfiguriertes Secret bewusst gesperrt.

    const authHeader = req.headers.get('authorization')
    if (authHeader === `Bearer ${secret}`) return true

    const querySecret = req.nextUrl.searchParams.get('secret')
    if (querySecret === secret) return true

    return false
}

async function handle(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const results = await syncAllConnections()
        const totals = Object.values(results).reduce(
            (acc, r) => ({
                imported: acc.imported + r.imported,
                skipped: acc.skipped + r.skipped,
                failed: acc.failed + r.failed,
            }),
            { imported: 0, skipped: 0, failed: 0 },
        )
        return NextResponse.json({ ok: true, totals, results })
    } catch (err) {
        console.error('[rewe-sync] Fehler:', err)
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
}

export async function GET(req: NextRequest) {
    return handle(req)
}

export async function POST(req: NextRequest) {
    return handle(req)
}
