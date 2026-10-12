
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - Images
         * - Service-Worker und Web-Manifest (statisch, brauchen keine Sitzung —
         *   sonst kostet jeder Abruf einen Auth-Aufruf bei Supabase)
         * - Öffentliche Seiten ohne Login (Impressum, Datenschutz, Demo) — dort
         *   soll kein einziger Supabase-Aufruf passieren.
         */
        '/((?!_next/static|_next/image|favicon.ico|service-worker.js|manifest.webmanifest|impressum|datenschutz|demo|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
}
