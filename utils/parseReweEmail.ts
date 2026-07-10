import type { ReweMailMessage } from '@/utils/mailbox'

/**
 * Extrahiert Gesamtbetrag + Datum aus einer REWE-eBon-Mail — rein regelbasiert,
 * ohne KI. Sucht zuerst im Text-/HTML-Body, dann (falls nötig) im PDF-Attachment.
 *
 * KALIBRIEREN: Die Regex-Muster orientieren sich am üblichen REWE-eBon-Format
 * ("SUMME  EUR  42,17"). Sobald eine echte Mail vorliegt, hier gegen den echten
 * Wortlaut abgleichen (siehe scripts/rewe-sync-test.ts für einen Dry-Run).
 */

export type ParsedReweReceipt = {
    /** Gesamtbetrag in Euro, positiv. */
    totalAmount: number
    /** Bon-Datum als ISO-String (auf 12:00 Uhr normalisiert, Projekt-Konvention). */
    receiptDate: string
}

// Labels, hinter denen der Gesamtbetrag steht — in Prioritätsreihenfolge.
// "Höhe von" trifft den REWE-Mail-Body ("…Einkauf in Höhe von 1,49 €") und wird
// zuerst geprüft, damit der Ablenker "Bonus-Guthaben: 0,63 €" nicht greift.
// Die encoding-tolerante Variante deckt "Höhe"/"Hoehe" ab. SUMME/Zu zahlen/Gesamt
// greifen im PDF-Bon (Fallback).
const AMOUNT_LABELS = [
    /Höhe\s+von/i,
    /H\S{0,2}he\s+von/i,
    /SUMME/i,
    /Zu\s*zahlen/i,
    /Gesamtbetrag/i,
    /Gesamt/i,
]

/**
 * Wandelt einen deutschen Betrag-String ("1.234,56" / "42,17" / "42.17") in eine Zahl.
 */
function parseGermanAmount(raw: string): number | null {
    let s = raw.replace(/[\s€]/g, '').replace(/EUR/gi, '')
    if (!s) return null

    const hasComma = s.includes(',')
    const hasDot = s.includes('.')

    if (hasComma && hasDot) {
        // "1.234,56" → Punkt = Tausender, Komma = Dezimal
        s = s.replace(/\./g, '').replace(',', '.')
    } else if (hasComma) {
        // "42,17" → Komma = Dezimal
        s = s.replace(',', '.')
    }
    // nur Punkt oder gar kein Trennzeichen: bereits parsebar

    const value = parseFloat(s)
    return Number.isFinite(value) ? value : null
}

/**
 * Sucht den Gesamtbetrag in einem beliebigen Textblock.
 */
export function extractTotalFromText(text: string): number | null {
    if (!text) return null

    for (const label of AMOUNT_LABELS) {
        // Label, optional EUR/€ und Leerzeichen, dann die Zahl.
        const re = new RegExp(label.source + String.raw`[^0-9]{0,20}([0-9][0-9.,\s]*[0-9])`, 'i')
        const m = text.match(re)
        if (m) {
            const amount = parseGermanAmount(m[1])
            if (amount !== null && amount > 0) return amount
        }
    }
    return null
}

/**
 * Sucht das erste Datum im Format TT.MM.JJJJ und gibt es als ISO-String (12:00) zurück.
 */
export function extractDateFromText(text: string): string | null {
    if (!text) return null
    const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (!m) return null
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10) - 1
    const year = parseInt(m[3], 10)
    const d = new Date(year, month, day, 12, 0, 0) // Noon, DST-sicher
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Entfernt HTML-Tags grob, damit die Textsuche auch im HTML-Body greift.
 */
function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&euro;/gi, '€')
        // Gängige deutsche HTML-Entities dekodieren (falls die Mail sie nutzt statt UTF-8).
        .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
        .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
        .replace(/&szlig;/g, 'ß').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
}

/**
 * Liest den Text eines PDF-Attachments via pdfjs-dist (bereits im Projekt vorhanden).
 * Dynamischer Import (Node-only), damit der Next-Build nicht belastet wird.
 */
// Minimale Typen für den Teil der pdfjs-API, den wir nutzen (Textextraktion).
type PdfTextItem = { str?: string }
type PdfPage = { getTextContent(): Promise<{ items: PdfTextItem[] }> }
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> }
type PdfModule = {
    getDocument(src: { data: Uint8Array; useSystemFonts?: boolean }): { promise: Promise<PdfDoc> }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
        // Legacy-Build läuft ohne Browser-Worker in Node.
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule
        const data = new Uint8Array(buffer)
        const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
        let text = ''
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i)
            const content = await page.getTextContent()
            text += content.items.map((it) => it.str ?? '').join(' ') + '\n'
        }
        return text
    } catch (err) {
        console.error('[parseReweEmail] PDF-Textextraktion fehlgeschlagen:', err)
        return ''
    }
}

/**
 * Hauptfunktion: parst eine REWE-Mail zu { totalAmount, receiptDate } oder null,
 * wenn kein Gesamtbetrag gefunden wird (Mail wird dann übersprungen).
 */
export async function parseReweEmail(msg: ReweMailMessage): Promise<ParsedReweReceipt | null> {
    // 1. Body-Text bündeln (Text + entschärftes HTML).
    const bodyText = [msg.text, msg.html ? stripHtml(msg.html) : ''].filter(Boolean).join('\n')

    let totalAmount = extractTotalFromText(bodyText)
    let dateSource = bodyText

    // 2. Falls kein Betrag im Body: PDF-Attachments durchsuchen.
    if (totalAmount === null && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
            const isPdf =
                att.contentType?.toLowerCase().includes('pdf') ||
                att.filename?.toLowerCase().endsWith('.pdf')
            if (!isPdf) continue

            const pdfText = await extractPdfText(att.content)
            const amount = extractTotalFromText(pdfText)
            if (amount !== null) {
                totalAmount = amount
                dateSource = pdfText
                break
            }
        }
    }

    if (totalAmount === null) return null

    // 3. Datum: der Betreff ("Dein REWE eBon vom 09.07.2026") ist die sauberste Quelle,
    //    danach die Betrags-Quelle/Body, zuletzt der Date-Header der Mail.
    const receiptDate =
        extractDateFromText(msg.subject) ||
        extractDateFromText(dateSource) ||
        extractDateFromText(bodyText) ||
        (msg.date ? msg.date.toISOString() : new Date().toISOString())

    return { totalAmount, receiptDate }
}
