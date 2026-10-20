import { describe, it, expect } from 'vitest'
import {
    deriveFields, hasReceiptScan, isNonItemName, isStale, orderOpen, parseAmountInput, toIsoDay, validateAnswer,
    type PendingReceiptRow,
} from './fields'
import { buildRequestBody, extractReceipt, GeminiError, modelsFromEnv } from './gemini'

const NOW = new Date('2026-10-20T12:00:00')

const answer = (over: Record<string, unknown> = {}) => ({
    ist_kassenbon: true,
    laden: 'REWE',
    datum: '2026-10-18',
    summe: 4.47,
    kategorie: 'Essen',
    artikel: [
        { name: 'JA! TOMATENSOSSE', menge: 2, einheit: 'stk', preis: 1.98 },
        { name: 'BANANEN', menge: 1.234, einheit: 'kg', preis: 2.74 },
        { name: 'PFAND RUECKGABE', menge: 1, preis: -0.25 },
        { name: 'SUMME', menge: 1, preis: 4.47 },
        { name: 'Kartenzahlung', menge: 1, preis: 4.47 },
    ],
    ...over,
})

describe('validateAnswer', () => {
    it('übernimmt einen sauberen Bon und lässt Summen-/Zahlungszeilen weg', () => {
        const { result, findings } = validateAnswer(answer(), NOW)
        expect(result.ok).toBe(true)
        expect(result.store).toBe('REWE')
        expect(result.date).toBe('2026-10-18')
        expect(result.total).toBe(4.47)
        expect(result.items.map((i) => i.nameRaw)).toEqual(['JA! TOMATENSOSSE', 'BANANEN', 'PFAND RUECKGABE'])
        expect(result.items[0]).toMatchObject({ quantity: 2, unitPrice: 0.99, totalPrice: 1.98 })
        expect(result.items[1].unit).toBe('kg')
        expect(result.items[2].totalPrice).toBe(-0.25)
        expect(findings.map((f) => f.code)).toEqual(['items_dropped'])
    })

    it('krumme Menge ohne kg ist ein verlesener Preis → Menge 1', () => {
        const { result } = validateAnswer(answer({ artikel: [
            { name: 'Schokodonut', menge: 0.79, einheit: 'stk', preis: 0.59 },
            { name: 'Ingwer', menge: 0.134, einheit: 'kg', preis: 0.8 },
        ] }), NOW)
        expect(result.items[0]).toMatchObject({ quantity: 1, unitPrice: null })
        expect(result.items[1]).toMatchObject({ quantity: 0.134, unit: 'kg' })
    })

    it('meldet eine abweichende Artikelsumme nur als Warnung', () => {
        const { result, findings } = validateAnswer(answer({ summe: 9.99 }), NOW)
        expect(result.ok).toBe(true)
        expect(findings.find((f) => f.code === 'items_sum_mismatch')?.severity).toBe('warn')
    })

    it('fehlende oder nicht positive Summe ist ein Fehler', () => {
        expect(validateAnswer(answer({ summe: null }), NOW).result.ok).toBe(false)
        const neg = validateAnswer(answer({ summe: -3 }), NOW)
        expect(neg.result.total).toBeNull()
        expect(neg.result.ok).toBe(false)
    })

    it('kein Kassenbon → Fehler', () => {
        const { result, findings } = validateAnswer(answer({ ist_kassenbon: false }), NOW)
        expect(result.ok).toBe(false)
        expect(findings[0].code).toBe('not_a_receipt')
    })

    it('Datum in der Zukunft oder unbekannte Kategorie werden verworfen', () => {
        const { result, findings } = validateAnswer(answer({ datum: '2027-01-01', kategorie: 'Urlaub' }), NOW)
        expect(result.date).toBeNull()
        expect(result.category).toBeNull()
        expect(findings.map((f) => f.code)).toEqual(expect.arrayContaining(['date_future', 'category_unknown']))
    })

    it('liest Beträge auch als Text mit Komma', () => {
        const { result } = validateAnswer(answer({ summe: '1.234,50', artikel: [{ name: 'Fernseher', preis: '1.234,50' }] }), NOW)
        expect(result.total).toBe(1234.5)
        expect(result.items[0].totalPrice).toBe(1234.5)
    })

    it('Adresse statt Laden → Warnung', () => {
        const { findings } = validateAnswer(answer({ laden: 'Hauptstraße 5' }), NOW)
        expect(findings.some((f) => f.code === 'store_is_address')).toBe(true)
    })
})

describe('Hilfsfunktionen', () => {
    it('isNonItemName', () => {
        expect(isNonItemName('Summe')).toBe(true)
        expect(isNonItemName('MwSt 7%')).toBe(true)
        expect(isNonItemName('Rückgeld')).toBe(true)
        expect(isNonItemName('Bio Karotten')).toBe(false)
    })

    it('toIsoDay', () => {
        expect(toIsoDay('2026-10-05')).toBe('2026-10-05')
        expect(toIsoDay('05.10.2026')).toBe('2026-10-05')
        expect(toIsoDay('5.10.26')).toBe('2026-10-05')
        expect(toIsoDay('31.02.2026')).toBeNull()
        expect(toIsoDay('gestern')).toBeNull()
    })

    it('parseAmountInput', () => {
        expect(parseAmountInput('12,34')).toBe(12.34)
        expect(parseAmountInput(' 5 € ')).toBe(5)
        expect(Number.isNaN(parseAmountInput(''))).toBe(true)
    })
})

const row = (over: Partial<PendingReceiptRow>): PendingReceiptRow => ({
    id: 'x', created_at: '2026-10-20T10:00:00Z', status: 'ready', started_at: null, finished_at: null, skipped_at: null,
    image_paths: [], result: null, findings: [], edits: {}, error: null, message: null, ...over,
})

describe('deriveFields', () => {
    const result = { store: 'Lidl', date: '2026-10-19', total: 12.5, category: 'Essen', items: [{ nameRaw: 'Milch', quantity: 1, unit: null, unitPrice: null, totalPrice: 1.19 }], ok: true }

    it('ohne Ergebnis: leere Felder, heutiges Datum', () => {
        const f = deriveFields(row({}), () => '2026-10-20')
        expect(f).toMatchObject({ store: '', amount: '', date: '2026-10-20', category: 'Essen', items: [] })
    })

    it('Ergebnis des Agenten ist gekennzeichnet', () => {
        const f = deriveFields(row({ result }))
        expect(f).toMatchObject({ store: 'Lidl', amount: '12,50', date: '2026-10-19' })
        expect(f.fromAgent).toEqual({ store: true, amount: true, date: true, category: true, items: true })
    })

    it('Handänderungen gewinnen und gelten nicht als vom Agenten', () => {
        const f = deriveFields(row({ result, edits: { amount: '13,00', store: 'Lidl Nord' } }))
        expect(f.amount).toBe('13,00')
        expect(f.store).toBe('Lidl Nord')
        expect(f.fromAgent.amount).toBe(false)
        expect(f.fromAgent.date).toBe(true)
    })
})

describe('offene Bons', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')

    it('hängende Auswertung gilt nach 4 Minuten als unterbrochen', () => {
        expect(isStale(row({ status: 'reading', started_at: '2026-10-20T11:59:00Z' }), now)).toBe(false)
        expect(isStale(row({ status: 'reading', started_at: '2026-10-20T11:50:00Z' }), now)).toBe(true)
        expect(isStale(row({ status: 'ready', started_at: '2026-10-20T11:50:00Z' }), now)).toBe(false)
    })

    it('orderOpen: neue zuerst, ignorierte dahinter, laufende gar nicht', () => {
        const list = [
            row({ id: 'alt', created_at: '2026-10-20T09:00:00Z' }),
            row({ id: 'neu', created_at: '2026-10-20T11:00:00Z' }),
            row({ id: 'ignoriert', created_at: '2026-10-20T11:30:00Z', skipped_at: '2026-10-20T11:40:00Z' }),
            row({ id: 'läuft', status: 'reading', started_at: '2026-10-20T11:59:30Z' }),
        ]
        expect(orderOpen(list, now).map((r) => r.id)).toEqual(['neu', 'alt', 'ignoriert'])
    })
})

describe('hasReceiptScan', () => {
    it('zählt nur app_metadata, nie user_metadata', () => {
        expect(hasReceiptScan({ app_metadata: { receipt_scan: true } })).toBe(true)
        expect(hasReceiptScan({ app_metadata: { receipt_scan: 'true' } })).toBe(false)
        expect(hasReceiptScan({ app_metadata: {}, user_metadata: { receipt_scan: true } } as never)).toBe(false)
        expect(hasReceiptScan(null)).toBe(false)
    })
})

// ---------------------------------------------------------------- Gemini (Netz gemockt)

type Call = { url: string; body: string; headers: Record<string, string> }

function fakeFetch(responses: { status: number; body?: unknown; text?: string }[]) {
    const calls: Call[] = []
    const fn = async (url: string, init: { headers: Record<string, string>; body: string }) => {
        calls.push({ url, body: init.body, headers: init.headers })
        const r = responses[calls.length - 1] ?? { status: 500 }
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body,
            text: async () => r.text ?? JSON.stringify(r.body ?? ''),
        }
    }
    return { fn, calls }
}

const okBody = (obj: unknown) => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
    usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 250, thoughtsTokenCount: 400, totalTokenCount: 1950 },
})
const file = { mimeType: 'image/jpeg', base64: 'AAAA' }

describe('extractReceipt', () => {
    it('schickt Bild + Schema, Schlüssel nur im Header', async () => {
        const { fn, calls } = fakeFetch([{ status: 200, body: okBody(answer()) }])
        const res = await extractReceipt([file], { apiKey: 'k', models: ['m1'], fetch: fn })
        expect(res.model).toBe('m1')
        expect(res.usage).toEqual({ input: 1300, output: 250, thoughts: 400, total: 1950 })
        expect(res.answer.laden).toBe('REWE')
        expect(calls[0].url).toContain('/models/m1:generateContent')
        expect(calls[0].url).not.toContain('k')
        expect(calls[0].headers['x-goog-api-key']).toBe('k')
        const sent = JSON.parse(calls[0].body)
        expect(sent.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'AAAA' })
        expect(sent.generationConfig.responseMimeType).toBe('application/json')
    })

    it('wechselt bei aufgebrauchtem Kontingent (429) auf das nächste Modell', async () => {
        const { fn, calls } = fakeFetch([{ status: 429 }, { status: 200, body: okBody(answer()) }])
        const res = await extractReceipt([file], { apiKey: 'k', models: ['flash', 'lite'], fetch: fn })
        expect(res.model).toBe('lite')
        expect(calls).toHaveLength(2)
    })

    it('hängt ein Modell (Zeitlimit), kommt das nächste dran', async () => {
        const calls: string[] = []
        const fn = async (url: string) => {
            calls.push(url)
            if (calls.length === 1) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
            return { ok: true, status: 200, json: async () => okBody(answer()), text: async () => '' }
        }
        const res = await extractReceipt([file], { apiKey: 'k', models: ['flash', 'lite'], fetch: fn })
        expect(res.model).toBe('lite')
        expect(calls).toHaveLength(2)
    })

    it('Flash bekommt 60 s, Flash-Lite 30 s', async () => {
        const waits: number[] = []
        const real = AbortSignal.timeout
        AbortSignal.timeout = ((ms: number) => { waits.push(ms); return real.call(AbortSignal, ms) }) as typeof AbortSignal.timeout
        try {
            const { fn } = fakeFetch([{ status: 503 }, { status: 200, body: okBody(answer()) }])
            await extractReceipt([file], { apiKey: 'k', models: ['gemini-flash-latest', 'gemini-flash-lite-latest'], fetch: fn })
        } finally {
            AbortSignal.timeout = real
        }
        expect(waits).toEqual([60_000, 30_000])
    })

    it('alle hängen → verständliche Meldung', async () => {
        const fn = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }
        await expect(extractReceipt([file], { apiKey: 'k', models: ['a', 'b'], fetch: fn })).rejects.toThrow(/zu lange/)
    })

    it('alle Modelle erschöpft → verständliche Kontingent-Meldung', async () => {
        const { fn } = fakeFetch([{ status: 429 }, { status: 429 }])
        await expect(extractReceipt([file], { apiKey: 'k', models: ['a', 'b'], fetch: fn }))
            .rejects.toMatchObject({ kind: 'quota' })
    })

    it('ohne Schlüssel → Einrichtungs-Fehler, kein Netz', async () => {
        const { fn, calls } = fakeFetch([])
        await expect(extractReceipt([file], { apiKey: '', models: ['a'], fetch: fn })).rejects.toBeInstanceOf(GeminiError)
        expect(calls).toHaveLength(0)
    })

    it('falscher Schlüssel → config-Fehler', async () => {
        const { fn } = fakeFetch([{ status: 400, text: 'API key not valid. Please pass a valid API key.' }])
        await expect(extractReceipt([file], { apiKey: 'x', models: ['a'], fetch: fn })).rejects.toMatchObject({ kind: 'config' })
    })

    it('unlesbare Antwort → failed', async () => {
        const { fn } = fakeFetch([{ status: 200, body: { candidates: [{ content: { parts: [{ text: 'kein json' }] } }] } }])
        await expect(extractReceipt([file], { apiKey: 'x', models: ['a'], fetch: fn })).rejects.toMatchObject({ kind: 'failed' })
    })

    it('Rückfrage: eigene Antwort + Hinweis als weitere Gesprächsrunden', () => {
        const body = buildRequestBody([file], { previousAnswer: '{"summe":3.41}', feedback: 'Prüfe deine Antwort' })
        expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
        expect(body.contents[1].parts[0]).toEqual({ text: '{"summe":3.41}' })
    })

    it('Frist kürzt die Wartezeit; ohne Restzeit kein Aufruf', async () => {
        const { fn, calls } = fakeFetch([])
        await expect(extractReceipt([file], { apiKey: 'k', models: ['a'], fetch: fn, deadlineAt: Date.now() + 1000 })).rejects.toThrow(/zu lange/)
        expect(calls).toHaveLength(0)
    })

    it('mehrere Seiten gehen in eine Anfrage', () => {
        const body = buildRequestBody([file, { mimeType: 'application/pdf', base64: 'BBBB' }])
        expect(body.contents[0].parts).toHaveLength(3)
    })

    it('Modellliste aus der Umgebung', () => {
        expect(modelsFromEnv(' a , b ')).toEqual(['a', 'b'])
        expect(modelsFromEnv('')).toEqual(['gemini-flash-lite-latest', 'gemini-flash-latest'])
    })
})
