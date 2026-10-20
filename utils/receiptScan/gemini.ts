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
 * Flash liest deutlich genauer (im Test: schräg fotografierter Lidl-Bon komplett richtig, Flash-Lite
 * hat dort Preise verrutscht), ist aber bei Überlast langsam. Deshalb bekommt Flash bis zu 60 s,
 * danach springt Flash-Lite ein (größeres Kontingent, antwortet meist in wenigen Sekunden).
 * Per GEMINI_MODELS (Komma-Liste) änderbar.
 */
export const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/** Wartezeit für das erste (genauere) Modell, danach für jedes Ersatzmodell. */
export const FIRST_TIMEOUT_MS = 60_000
export const FALLBACK_TIMEOUT_MS = 30_000

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
    '  Mehrfachkauf steht oft als "Einzelpreis x Anzahl" unter oder neben dem Artikel (z. B. "0,79 x 2" und rechts "1,58"): dann menge = 2 und preis = 1,58. Jeder Artikel hat seinen eigenen Preis aus seiner Zeile; der Gesamtbetrag gehört zu keinem Artikel.',
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

export function buildRequestBody(files: GeminiFile[]) {
    return {
        contents: [{
            role: 'user',
            parts: [
                ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
                { text: RECEIPT_PROMPT },
            ],
        }],
        generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: RECEIPT_SCHEMA,
        },
    }
}

export function modelsFromEnv(value: string | undefined = process.env.GEMINI_MODELS): string[] {
    const list = (value ?? '').split(',').map((m) => m.trim()).filter(Boolean)
    return list.length > 0 ? list : DEFAULT_MODELS
}

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
    opts: { apiKey?: string; models?: string[]; fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<{ answer: Record<string, unknown>; model: string; modelVersion?: string; usage?: GeminiUsage }> {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey) throw new GeminiError('Die Bon-Auswertung ist noch nicht eingerichtet (GEMINI_API_KEY fehlt).', 'config')
    if (files.length === 0) throw new GeminiError('Kein Bild zum Auswerten.', 'failed')

    const doFetch = opts.fetch ?? (fetch as unknown as FetchLike)
    const body = JSON.stringify(buildRequestBody(files))
    let lastQuota = false
    let timedOut = false

    for (const [i, model] of (opts.models ?? modelsFromEnv()).entries()) {
        let res: Awaited<ReturnType<FetchLike>>
        try {
            res = await doFetch(`${ENDPOINT}/${model}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body,
                signal: AbortSignal.timeout(opts.timeoutMs ?? (i === 0 ? FIRST_TIMEOUT_MS : FALLBACK_TIMEOUT_MS)),
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
            return { answer: parsed as Record<string, unknown>, model, modelVersion, usage: usageOf(json) }
        } catch {
            throw new GeminiError('Die Antwort von Gemini war nicht lesbar.', 'failed')
        }
    }

    if (lastQuota) throw new GeminiError('Das kostenlose Tageskontingent für die Bon-Auswertung ist aufgebraucht — ab ca. 9 Uhr geht es wieder. Du kannst den Bon solange selbst eintragen.', 'quota')
    throw new GeminiError(timedOut
        ? 'Gemini hat zu lange gebraucht (überlastet). Bitte gleich noch einmal versuchen oder selbst eintragen.'
        : 'Gemini ist gerade überlastet. Bitte gleich noch einmal versuchen.', 'failed')
}
