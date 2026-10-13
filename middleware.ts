
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

// Die Seiten selbst melden sich im Browser an (Supabase-Client frischt das Token dort
// auch selbst auf) — beim Öffnen einer Seite braucht es die Middleware also nicht. Sie
// kostete jedes Mal einen Aufruf an Supabase Auth (~100 ms), bevor die Seite kam.
// Server Actions (POST mit "Next-Action"-Header) lesen die Sitzung aus dem Cookie und
// bekommen sie weiterhin frisch, ebenso /api.
export const config = {
    matcher: [
        {
            source: '/((?!_next/static|_next/image|favicon.ico|service-worker.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
            has: [{ type: 'header', key: 'next-action' }],
        },
        '/api/:path*',
    ],
}
