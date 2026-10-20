/**
 * Bons aus anderen Apps empfangen ("Teilen" → Mein Cashflow), Web Share Target API.
 *
 * Ablauf: Android schickt die geteilten Dateien per POST an SHARE_ACTION. Der Service Worker
 * (public/service-worker.js) fängt den POST ab, legt die Dateien in IndexedDB und leitet auf
 * "/?share=ok" um — der Server sieht die großen Dateien nie (Vercel nimmt ~4,5 MB pro Anfrage).
 * Die Startseite holt sie danach aus IndexedDB (shareInbox.ts), verkleinert sie wie ein Foto aus
 * der Scan-Ansicht und startet den Scan (pendingStore.startScan).
 *
 * Diese Datei enthält nur die reinen Teile (Manifest, Dateiauswahl, Alter) und ist browserfrei
 * testbar. Die Namen unten stehen auch in public/service-worker.js (kann nichts importieren);
 * shareTarget.test.ts prüft, dass beide übereinstimmen.
 */

/** Adresse, an die Android die geteilten Dateien schickt (Manifest + Service Worker). */
export const SHARE_ACTION = '/share-receipt'
/** Name des Formularfelds mit den Dateien. */
export const SHARE_FIELD = 'files'
/** IndexedDB, in die der Service Worker die Dateien legt. */
export const SHARE_DB = 'cashflow-share'
export const SHARE_STORE = 'files'
/** Parameter der Startseite nach dem Teilen. */
export const SHARE_PARAM = 'share'
/** Geteilte Dateien, die länger liegen (z. B. nie angemeldet), werden verworfen. */
export const SHARE_MAX_AGE_MS = 60 * 60 * 1000

/** Teil des Web-App-Manifests (app/manifest.ts). */
export function shareTargetManifest() {
    return {
        action: SHARE_ACTION,
        method: 'POST' as const,
        enctype: 'multipart/form-data' as const,
        params: {
            files: [{ name: SHARE_FIELD, accept: ['image/*', 'application/pdf'] }],
        },
    }
}

/** Was der Service Worker nach dem Teilen in die Adresse schreibt. */
export type ShareStatus = 'ok' | 'empty' | 'error' | 'unsupported'

const STATUSES: readonly string[] = ['ok', 'empty', 'error', 'unsupported']

/** Liest ?share=… aus der Adresse; null, wenn die Seite nicht über "Teilen" geöffnet wurde. */
export function parseShareStatus(search: string): ShareStatus | null {
    const value = new URLSearchParams(search).get(SHARE_PARAM)
    return value !== null && STATUSES.includes(value) ? (value as ShareStatus) : null
}

/** Adresse ohne ?share=…, damit ein Neuladen den Empfang nicht wiederholt. */
export function withoutShareParam(href: string): string {
    const url = new URL(href)
    url.searchParams.delete(SHARE_PARAM)
    return url.pathname + url.search + url.hash
}

/** Hinweistext für alles außer "ok". */
export function shareStatusMessage(status: Exclude<ShareStatus, 'ok'>): string {
    switch (status) {
        case 'empty':
            return 'Es kam keine Datei an. Bitte den Bon noch einmal teilen.'
        case 'unsupported':
            return 'Das Teilen hat diesmal nicht geklappt. Bitte die App einmal normal öffnen und den Bon danach noch einmal teilen.'
        default:
            return 'Der geteilte Bon konnte nicht übernommen werden. Bitte noch einmal teilen oder in der Scan-Ansicht wählen.'
    }
}

export const SHARE_NOT_ENABLED_MESSAGE =
    'Der Bon-Scan ist für dieses Konto nicht freigeschaltet. Der geteilte Bon wurde nicht gespeichert.'

/**
 * Nur Fotos und PDFs behalten. Manche Apps teilen ein PDF als application/octet-stream oder ohne
 * Typ — dann entscheidet die Endung.
 */
export function pickReceiptFiles(files: File[]): File[] {
    const out: File[] = []
    for (const f of files) {
        const type = f.type.toLowerCase()
        if (type === 'application/pdf' || type.startsWith('image/')) out.push(f)
        else if ((type === '' || type === 'application/octet-stream') && /\.pdf$/i.test(f.name)) {
            out.push(new File([f], f.name, { type: 'application/pdf' }))
        }
    }
    return out
}

/** Noch frisch genug, um übernommen zu werden? */
export function isShareFresh(savedAt: number, now: number = Date.now()): boolean {
    const age = now - savedAt
    return age >= 0 && age <= SHARE_MAX_AGE_MS
}
