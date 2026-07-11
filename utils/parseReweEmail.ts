import type { ReweMailMessage } from '@/utils/mailbox'

/**
 * Extrahiert Gesamtbetrag + Datum aus einer REWE-eBon-Mail — rein regelbasiert,
 * ohne KI. Sucht zuerst im Text-/HTML-Body, dann (falls nötig) im PDF-Attachment.
 *
 * KALIBRIEREN: Die Regex-Muster orientieren sich am üblichen REWE-eBon-Format
 * ("SUMME  EUR  42,17"). Sobald eine echte Mail vorliegt, hier gegen den echten
 * Wortlaut abgleichen (siehe scripts/rewe-sync-test.ts für einen Dry-Run).
 */

export type ParsedReweItem = {
    /** Originaltext der Artikelzeile vom Bon (z. B. "JA! TOMATENSOSSE"). */
    nameRaw: string
    /** Menge (Stück oder kg); 1 wenn keine Mengenzeile vorhanden. */
    quantity: number
    unit: 'stk' | 'kg' | null
    /** Einzelpreis, falls Mengenzeile vorhanden. */
    unitPrice: number | null
    /** Zeilensumme; negativ bei Pfand-Rückgabe/Rabatt. */
    totalPrice: number
}

export type ParsedReweReceipt = {
    /** Gesamtbetrag in Euro, positiv. */
    totalAmount: number
    /** Bon-Datum als ISO-String (auf 12:00 Uhr normalisiert, Projekt-Konvention). */
    receiptDate: string
    /** Einzelartikel aus dem PDF-Bon — optionale Zusatzinfo, fehlt bei Parse-Problemen. */
    items?: ParsedReweItem[]
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
type PdfTextItem = { str?: string; transform?: number[] }
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
 * Extrahiert die echten Bon-Zeilen aus dem PDF: pdfjs liefert Text-Fragmente mit
 * Koordinaten; Fragmente mit (fast) gleicher Y-Koordinate gehören zu einer Zeile.
 * (extractPdfText joint alles mit ' ' und zerstört die Zeilenstruktur — für den
 * Gesamtbetrag egal, für Artikelzeilen entscheidend.)
 */
export async function extractPdfLines(buffer: Buffer): Promise<string[]> {
    try {
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
        const lines: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i)
            const content = await page.getTextContent()

            // Fragmente nach gerundeter Y-Koordinate gruppieren (transform[5] = y).
            const rows = new Map<number, { x: number; str: string }[]>()
            for (const it of content.items) {
                const str = it.str ?? ''
                if (!str.trim() || !it.transform) continue
                const y = Math.round(it.transform[5])
                if (!rows.has(y)) rows.set(y, [])
                rows.get(y)!.push({ x: it.transform[4], str })
            }

            // Von oben nach unten (PDF-Y wächst nach oben), je Zeile von links nach rechts.
            const ys = [...rows.keys()].sort((a, b) => b - a)
            for (const y of ys) {
                const line = rows
                    .get(y)!
                    .sort((a, b) => a.x - b.x)
                    .map((p) => p.str)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                if (line) lines.push(line)
            }
        }
        return lines
    } catch (err) {
        console.error('[parseReweEmail] PDF-Zeilenextraktion fehlgeschlagen:', err)
        return []
    }
}

// Artikelzeile: "NAME … 1,49 B" — Betrag + Steuerklasse (A/B) am Zeilenende, optional "*".
const ITEM_LINE_RE = /^(.+?)\s+(-?\d{1,4}[.,]\d{2})\s+([AB])\s*\*?$/
// Mengenzeile Stück: "2 Stk x 0,49" oder "2 x 0,49"
const QTY_STK_RE = /^(\d+)\s*(?:Stk\.?\s*)?x\s*(\d{1,4}[.,]\d{2})\s*$/i
// Mengenzeile Gewicht: "0,326 kg x 2,99 EUR/kg" (Handeingabe/Waage)
const QTY_KG_RE = /^(\d+[.,]\d{1,3})\s*kg\s*x\s*(\d{1,4}[.,]\d{2})(?:\s*EUR\/kg)?\s*$/i
// Zeilen, die keine Artikel sind, obwohl sie ins Betragsmuster passen könnten.
const NON_ITEM_RE = /^(SUMME|Geg\.|Rückgeld|AUSGESTELLT|E-Bon|Coupon eingel)/i

/**
 * Parst die Artikelzeilen eines REWE-eBon-PDFs (Bereich zwischen "EUR"-Kopfzeile
 * und der SUMME-Zeile). Mengenzeilen ("2 Stk x 0,49", "0,326 kg x 2,99 EUR/kg")
 * werden dem vorherigen Artikel zugeordnet.
 */
export function parseReweItems(lines: string[]): ParsedReweItem[] {
    const items: ParsedReweItem[] = []
    let inItems = false

    for (const raw of lines) {
        const line = raw.trim()

        if (!inItems) {
            // Der Artikelbereich beginnt nach der (rechtsbündigen) "EUR"-Kopfzeile.
            if (/^EUR$/.test(line)) inItems = true
            continue
        }
        if (/^SUMME/i.test(line)) break
        if (NON_ITEM_RE.test(line)) continue

        // Mengenzeile? → gehört zum vorherigen Artikel.
        const kg = line.match(QTY_KG_RE)
        if (kg && items.length > 0) {
            const last = items[items.length - 1]
            last.quantity = parseFloat(kg[1].replace(',', '.'))
            last.unit = 'kg'
            last.unitPrice = parseFloat(kg[2].replace(',', '.'))
            continue
        }
        const stk = line.match(QTY_STK_RE)
        if (stk && items.length > 0) {
            const last = items[items.length - 1]
            last.quantity = parseInt(stk[1], 10)
            last.unit = 'stk'
            last.unitPrice = parseFloat(stk[2].replace(',', '.'))
            continue
        }

        // Artikelzeile?
        const m = line.match(ITEM_LINE_RE)
        if (m) {
            items.push({
                nameRaw: m[1].trim(),
                quantity: 1,
                unit: null,
                unitPrice: null,
                totalPrice: parseFloat(m[2].replace(',', '.')),
            })
        }
        // Alles andere (Adresse, Leergut-Hinweise, …) ignorieren.
    }

    return items
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

    // 4. Einzelartikel aus dem PDF-Bon — best-effort, Fehler brechen den Import nicht.
    let items: ParsedReweItem[] | undefined
    try {
        const pdf = msg.attachments.find(
            (a) => a.contentType?.toLowerCase().includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf'),
        )
        if (pdf) {
            const lines = await extractPdfLines(pdf.content)
            const parsedItems = parseReweItems(lines)
            if (parsedItems.length > 0) items = parsedItems
        }
    } catch (err) {
        console.warn('[parseReweEmail] Artikel-Parsing fehlgeschlagen (Import läuft weiter):', err)
    }

    return { totalAmount, receiptDate, items }
}
