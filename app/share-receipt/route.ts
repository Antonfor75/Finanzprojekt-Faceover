import { NextResponse, type NextRequest } from 'next/server'

/**
 * Notausgang für "Teilen": Normalerweise fängt der Service Worker den POST ab (public/service-worker.js)
 * und der Server sieht ihn nie. Kommt er trotzdem hier an (Service Worker noch nicht aktiv oder alt),
 * wird nichts gespeichert — die Startseite zeigt einen Hinweis. Die Dateien werden bewusst nicht gelesen.
 */
const back = (request: NextRequest) => NextResponse.redirect(new URL('/?share=unsupported', request.url), 303)

export const POST = back
export const GET = back
