import { extractReceipt, reviewModelsFromEnv, type GeminiFile, type GeminiUsage } from './gemini'
import { itemsTotal, validateAnswer, type Finding, type ReceiptResult } from './fields'

/**
 * Ein Bon von Anfang bis Ende: lesen → prüfen → bei Bedarf selbst korrigieren lassen.
 * Gemeinsam genutzt von der Server Action (app/actions/receiptScan.ts) und der Messung
 * (scripts/receipt-eval), damit gemessen wird, was die App wirklich tut.
 *
 * Selbstkorrektur: Passen die Artikel nicht zum Gesamtbetrag, bekommt das Modell seine eigene
 * Antwort zurück, mit konkretem Hinweis, worauf es achten soll (verrutschte Preisspalte,
 * Mengenzeilen, übersehene Rabatte). Übernommen wird die zweite Lesung nur, wenn sie besser passt.
 * Der zweite Aufruf kommt nur bei erkanntem Fehler, kostet also selten Kontingent.
 */

export type Reading = { result: ReceiptResult; findings: Finding[] }

export type AnalyzeOutcome = Reading & {
    model: string
    usage?: GeminiUsage
    /** Erste Lesung — nur zum Vergleich (Messung), die App nutzt result/findings. */
    first: Reading
    /** Wurde nachgefragt, und hat es geholfen? */
    review: 'none' | 'improved' | 'unchanged' | 'skipped'
}

type Extract = typeof extractReceipt

/** Abstand der Artikelsumme zum Gesamtbetrag in Euro; null, wenn sich das nicht prüfen lässt. */
export function sumGap(result: Pick<ReceiptResult, 'total' | 'items'>): number | null {
    if (result.total === null || result.items.length === 0) return null
    return Math.round(Math.abs(itemsTotal(result.items) - result.total) * 100) / 100
}

/** Lohnt eine Rückfrage? Nur bei echter Abweichung (Rundung bis 2 Cent zählt nicht). */
export function needsReview(reading: Reading): boolean {
    const gap = sumGap(reading.result)
    return gap !== null && gap > 0.02
}

const euro = (n: number) => n.toFixed(2).replace('.', ',')

export function reviewFeedback(result: Pick<ReceiptResult, 'total' | 'items'>): string {
    const sum = itemsTotal(result.items)
    return [
        `Prüfe deine Antwort: Deine Artikelpreise ergeben zusammen ${euro(sum)} €, der Bon nennt als Gesamtbetrag ${euro(result.total ?? 0)} €.`,
        'Lies die Artikelzeilen noch einmal genau:',
        '- Die Preise stehen in derselben Reihenfolge wie die Artikel: der 1. Preis gehört zum 1. Artikel, der 2. zum 2. usw. Auf schräg fotografierten Bons wirkt die Preisspalte um eine Zeile verschoben — ordne nach Reihenfolge, nicht nach Höhe, und vertausche keine Preise.',
        '- Eine Angabe wie "0,79 x 2" ist Menge mit Einzelpreis; sie gehört zu dem Artikel, in dessen Zeile sie steht, und sein Zeilenpreis ist 0,79 × 2 = 1,58. Zähle ihn nicht doppelt.',
        '- Übersieh keinen Artikel, keinen Rabatt und kein Pfand; Summen-, Zahlungs-, Steuer- und Rückgeldzeilen sind keine Artikel.',
        '- Ist der Gesamtbetrag selbst falsch gelesen, korrigiere ihn.',
        'Gib die vollständige, korrigierte Antwort im selben Format zurück.',
    ].join('\n')
}

export async function analyzeReceipt(
    files: GeminiFile[],
    opts: { extract?: Extract; now?: Date; deadlineAt?: number } = {},
): Promise<AnalyzeOutcome> {
    const extract = opts.extract ?? extractReceipt
    const first = await extract(files, { deadlineAt: opts.deadlineAt })
    const reading1 = validateAnswer(first.answer, opts.now)
    const base = { model: first.model, usage: first.usage, first: reading1 }

    if (!needsReview(reading1)) return { ...reading1, ...base, review: 'none' }

    let second: Awaited<ReturnType<Extract>>
    try {
        second = await extract(files, {
            deadlineAt: opts.deadlineAt,
            models: reviewModelsFromEnv(), // das genauere Flash prüft nach
            followUp: { previousAnswer: first.text, feedback: reviewFeedback(reading1.result) },
        })
    } catch {
        // Keine Zeit oder Kontingent mehr: die erste Lesung samt Warnung bleibt — der Nutzer prüft ohnehin.
        return { ...reading1, ...base, review: 'skipped' }
    }

    const reading2 = validateAnswer(second.answer, opts.now)
    const usage = addUsage(first.usage, second.usage)
    const gap1 = sumGap(reading1.result) ?? Infinity
    const gap2 = sumGap(reading2.result)
    // Nur übernehmen, wenn es wirklich besser passt (und nicht einfach die Artikel weggelassen wurden).
    if (gap2 !== null && gap2 < gap1 && reading2.result.total !== null) {
        const note: Finding = gap2 <= 0.02
            ? { code: 'self_corrected', severity: 'warn', message: 'Die erste Lesung passte nicht zur Summe — der Agent hat die Artikel noch einmal gelesen. Die Summe stimmt jetzt; bitte trotzdem kurz prüfen, ob jeder Preis beim richtigen Artikel steht.' }
            : { code: 'self_corrected_partly', severity: 'warn', message: 'Der Agent hat die Artikel nach einer Summen-Abweichung noch einmal geprüft; sie passen jetzt besser, aber noch nicht genau.' }
        return { result: reading2.result, findings: [note, ...reading2.findings], model: second.model, usage, first: reading1, review: 'improved' }
    }
    return { ...reading1, ...base, usage, review: 'unchanged' }
}

function addUsage(a?: GeminiUsage, b?: GeminiUsage): GeminiUsage | undefined {
    if (!a) return b
    if (!b) return a
    return { input: a.input + b.input, output: a.output + b.output, thoughts: a.thoughts + b.thoughts, total: a.total + b.total }
}
