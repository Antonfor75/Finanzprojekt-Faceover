import { RECEIPT_CATEGORIES } from './fields'

/**
 * Bon-Auswertung mit Google Gemini (AI-Studio-Schlüssel, kostenloser Plan). Nur auf dem Server
 * verwenden — der Schlüssel (GEMINI_API_KEY) darf nie in den Browser.
 *
 * Ein Bon = eine Anfrage: Bild(er) oder PDF rein, fertiges JSON nach festem Schema raus.
 * Das kostenlose Kontingent gilt pro Google-Projekt und Tag. Ist es beim ersten Modell
 * aufgebraucht (HTTP 429), das Modell überlastet (503) oder antwortet es nicht rechtzeitig,
 * wird das nächste versucht.
 */

/**
 * Lesen: Flash-Lite zuerst. Mit der Reihenfolge-Regel im Prompt las es alle Testbons richtig
 * (npm run eval:receipts, 7/7), antwortet in 1–2 s und hat das größere Tageskontingent. Ist es
 * erschöpft oder überlastet, springt Flash ein. Per GEMINI_MODELS (Komma-Liste) änderbar.
 */
export const DEFAULT_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']

/**
 * Selbstkorrektur (nur bei Summen-Abweichung, utils/receiptScan/analyze.ts): das genauere Flash
 * prüft nach; ist es überlastet, versucht es Flash-Lite. Per GEMINI_REVIEW_MODELS änderbar.
 */
export const DEFAULT_REVIEW_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/** Wartezeit je Modell: Flash ist bei Überlast langsam und bekommt mehr Zeit als Flash-Lite. */
export const FLASH_TIMEOUT_MS = 60_000
export const LITE_TIMEOUT_MS = 30_000
export const timeoutFor = (model: string) => (model.includes('lite') ? LITE_TIMEOUT_MS : FLASH_TIMEOUT_MS)

export type GeminiFile = { mimeType: string; base64: string }

/** Token-Verbrauch einer Auswertung (für die Kostenkontrolle im AI-Studio-Dashboard). */
export type GeminiUsage = { input: number; output: number; thoughts: number; total: number }

function usageOf(body: unknown): GeminiUsage | undefined {
    const u = (body as { usageMetadata?: Record<string, number> })?.usageMetadata
    if (!u) return undefined
    const n = (v: unknown) => (typeof v === 'number' ? v : 0)
    return { input: n(u.promptTokenCount), output: n(u.candidatesTokenCount), thoughts: n(u.thoughtsTokenCount), total: n(u.totalTokenCount) }
}

export class GeminiError extends Error {
    constructor(message: string, readonly kind: 'quota' | 'config' | 'failed') {
        super(message)
    }
}

export const RECEIPT_PROMPT = [
    'Du liest einen deutschen Kassenbon (Foto oder PDF, ggf. mehrere Seiten desselben Bons).',
    'Gib nur an, was wirklich auf dem Bon steht. Rate nichts dazu.',
    '- ist_kassenbon: false, wenn auf dem Bild kein Kassenbon/Kaufbeleg zu sehen ist.',
    '- laden: Name des Geschäfts, z. B. "REWE", "Lidl", "dm", "Kaufland" — keine Adresse.',
    '- datum: Kaufdatum als JJJJ-MM-TT.',
    '- summe: der bezahlte Gesamtbetrag in Euro (nach Rabatten, inklusive Pfand).',
    `- kategorie: genau eine aus: ${RECEIPT_CATEGORIES.join(', ')}. Supermarkt, Bäcker, Restaurant, Imbiss → Essen; Drogerie, Kosmetik → Schminki Schminki; Kleidung, Elektronik, Haushalt → Shoppi; Kino, Sport, Ausflug, Bar → Freizeit; sonst Sonstiges.`,
    '- artikel: jede gekaufte Position in Bon-Reihenfolge: name so wie auf dem Bon, menge (Stückzahl oder kg, sonst 1), einheit ("kg" bei Gewicht, sonst "stk"), preis = Zeilenpreis in Euro.',
    '  Pfand-Rückgabe, Rabatte und Coupons sind eigene Zeilen mit negativem preis.',
    '  Die Preise rechts stehen in derselben Reihenfolge wie die Artikel: der 1. Preis gehört zum 1. Artikel, der 2. zum 2. usw. Bei schräg fotografierten Bons wirkt die Preisspalte oft um eine Zeile verschoben — zuordnen nach Reihenfolge, nicht nach Höhe.',
    '  Mehrfachkauf steht als "Einzelpreis x Anzahl" (z. B. "0,79 x 2" mit Zeilenpreis "1,58") in der Zeile des Artikels oder direkt darunter: dann menge = 2 und preis = 1,58. Jeder Artikel hat genau einen Preis; der Gesamtbetrag gehört zu keinem Artikel.',
    '  Summen-, Zwischensummen-, Zahlungs-, Steuer- und Rückgeldzeilen sind KEINE Artikel.',
].join('\n')

/** Antwort-Schema (OpenAPI-Teilmenge der Gemini-API). */
export const RECEIPT_SCHEMA = {
    type: 'OBJECT',
    properties: {
        ist_kassenbon: { type: 'BOOLEAN' },
        laden: { type: 'STRING', nullable: true },
        datum: { type: 'STRING', nullable: true },
        summe: { type: 'NUMBER', nullable: true },
        kategorie: { type: 'STRING', nullable: true, enum: RECEIPT_CATEGORIES },
        artikel: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    name: { type: 'STRING' },
                    menge: { type: 'NUMBER' },
                    einheit: { type: 'STRING', enum: ['stk', 'kg'] },
                    preis: { type: 'NUMBER' },
                },
                required: ['name', 'preis'],
                propertyOrdering: ['name', 'menge', 'einheit', 'preis'],
            },
        },
    },
    required: ['ist_kassenbon', 'laden', 'datum', 'summe', 'kategorie', 'artikel'],
    propertyOrdering: ['ist_kassenbon', 'laden', 'datum', 'summe', 'kategorie', 'artikel'],
}

/** Rückfrage nach einer ersten Antwort: das Modell sieht seine Antwort und einen konkreten Prüfhinweis. */
export type FollowUp = { previousAnswer: string; feedback: string }

export function buildRequestBody(files: GeminiFile[], followUp?: FollowUp) {
    return {
        contents: [
            {
                role: 'user',
                parts: [
                    ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
                    { text: RECEIPT_PROMPT },
                ],
            },
            ...(followUp
                ? [
                    { role: 'model', parts: [{ text: followUp.previousAnswer }] },
                    { role: 'user', parts: [{ text: followUp.feedback }] },
                ]
                : []),
        ],
        generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: RECEIPT_SCHEMA,
        },
    }
}

export function modelsFromEnv(value: string | undefined = process.env.GEMINI_MODELS, fallback: string[] = DEFAULT_MODELS): string[] {
    const list = (value ?? '').split(',').map((m) => m.trim()).filter(Boolean)
    return list.length > 0 ? list : fallback
}

export const reviewModelsFromEnv = () => modelsFromEnv(process.env.GEMINI_REVIEW_MODELS, DEFAULT_REVIEW_MODELS)

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
    ok: boolean
    status: number
    json: () => Promise<unknown>
    text: () => Promise<string>
}>

/** Text der ersten Antwort herausholen (candidates[0].content.parts[*].text). */
function answerText(body: unknown): string | null {
    const parts = (body as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })
        ?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return null
    const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('')
    return text.trim() || null
}

/**
 * Bon auswerten. Liefert die rohe (noch ungeprüfte) Antwort und das Modell, das sie geliefert hat.
 * Wirft GeminiError mit verständlicher deutscher Meldung.
 */
export async function extractReceipt(
    files: GeminiFile[],
    opts: {
        apiKey?: string
        models?: string[]
        fetch?: FetchLike
        timeoutMs?: number
        /** Zeitpunkt (ms), bis zu dem spätestens fertig sein muss — kürzt die Wartezeit je Modell. */
        deadlineAt?: number
        followUp?: FollowUp
    } = {},
): Promise<{ answer: Record<string, unknown>; text: string; model: string; modelVersion?: string; usage?: GeminiUsage }> {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey) throw new GeminiError('Die Bon-Auswertung ist noch nicht eingerichtet (GEMINI_API_KEY fehlt).', 'config')
    if (files.length === 0) throw new GeminiError('Kein Bild zum Auswerten.', 'failed')

    const doFetch = opts.fetch ?? (fetch as unknown as FetchLike)
    const body = JSON.stringify(buildRequestBody(files, opts.followUp))
    let lastQuota = false
    let timedOut = false

    for (const model of opts.models ?? modelsFromEnv()) {
        let wait = opts.timeoutMs ?? timeoutFor(model)
        if (opts.deadlineAt !== undefined) wait = Math.min(wait, opts.deadlineAt - Date.now())
        if (wait < 5000) { timedOut = true; break } // keine Zeit mehr für einen sinnvollen Versuch
        let res: Awaited<ReturnType<FetchLike>>
        try {
            res = await doFetch(`${ENDPOINT}/${model}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body,
                signal: AbortSignal.timeout(wait),
            })
        } catch (err) {
            const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
            if (!timeout) throw new GeminiError('Gemini ist gerade nicht erreichbar.', 'failed')
            timedOut = true
            continue // Überlast zeigt sich oft als hängende Anfrage → nächstes Modell
        }

        if (res.status === 429 || res.status === 503) {
            lastQuota = res.status === 429 || lastQuota
            continue // nächstes Modell
        }
        if (res.status === 400 || res.status === 401 || res.status === 403) {
            const detail = await res.text().catch(() => '')
            if (/api key|API_KEY|permission/i.test(detail) || res.status !== 400) {
                throw new GeminiError('Der Gemini-Schlüssel wird nicht akzeptiert. Bitte GEMINI_API_KEY prüfen.', 'config')
            }
            throw new GeminiError('Gemini konnte das Bild nicht verarbeiten.', 'failed')
        }
        if (res.status === 404) continue // Modellname unbekannt → nächstes
        if (!res.ok) throw new GeminiError(`Gemini antwortet mit Fehler ${res.status}.`, 'failed')

        let json: unknown
        try {
            json = await res.json()
        } catch {
            timedOut = true
            continue // Antwort brach mitten im Lesen ab (Zeitlimit) → nächstes Modell
        }
        const text = answerText(json)
        if (!text) throw new GeminiError('Gemini hat keine Antwort geliefert (Bild evtl. blockiert oder unlesbar).', 'failed')
        try {
            const parsed = JSON.parse(text)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('kein Objekt')
            const modelVersion = (json as { modelVersion?: string })?.modelVersion
            return { answer: parsed as Record<string, unknown>, text, model, modelVersion, usage: usageOf(json) }
        } catch {
            throw new GeminiError('Die Antwort von Gemini war nicht lesbar.', 'failed')
        }
    }

    if (lastQuota) throw new GeminiError('Das kostenlose Tageskontingent für die Bon-Auswertung ist aufgebraucht — ab ca. 9 Uhr geht es wieder. Du kannst den Bon solange selbst eintragen.', 'quota')
    throw new GeminiError(timedOut
        ? 'Gemini hat zu lange gebraucht (überlastet). Bitte gleich noch einmal versuchen oder selbst eintragen.'
        : 'Gemini ist gerade überlastet. Bitte gleich noch einmal versuchen.', 'failed')
}
