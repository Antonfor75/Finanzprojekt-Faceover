/**
 * Messung der Bon-Auswertung gegen von Hand abgelesene Sollwerte.
 *
 *   npm run eval:receipts                               # alle Testbons
 *   RECEIPT_EVAL_ONLY=5996 npm run eval:receipts        # nur Dateien, die das enthalten
 *   GEMINI_MODELS=gemini-flash-lite-latest npm run eval:receipts   # anderes Modell
 *
 * Die Bons und labels.json liegen bewusst AUSSERHALB dieses (öffentlichen) Repos, Standard:
 * C:/Anton/Cashflow-AndroidApp/belege-referenz (änderbar per RECEIPT_EVAL_DIR). Der Bericht
 * landet dort unter eval-reports/. Jeder Lauf kostet echte Gemini-Anfragen (1 pro Bon, +1 bei
 * Selbstkorrektur) — das kostenlose Flash-Kontingent ist knapp.
 *
 * Gemessen wird genau, was die App tut: Fotos wie im Browser auf ~3 MP verkleinert, PDFs
 * unverändert, dann analyzeReceipt (lesen → prüfen → ggf. Selbstkorrektur).
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { it } from 'vitest'
import sharp from 'sharp'
import { analyzeReceipt } from '@/utils/receiptScan/analyze'
import { scoreReceipt, summarize, type ExpectedReceipt, type ReceiptScore } from '@/utils/receiptScan/evalScore'
import type { GeminiFile } from '@/utils/receiptScan/gemini'

const DIR = process.env.RECEIPT_EVAL_DIR ?? 'C:/Anton/Cashflow-AndroidApp/belege-referenz'
const ONLY = process.env.RECEIPT_EVAL_ONLY

async function load(file: string): Promise<GeminiFile> {
    const full = path.join(DIR, file)
    if (file.toLowerCase().endsWith('.pdf')) return { mimeType: 'application/pdf', base64: fs.readFileSync(full).toString('base64') }
    // Wie utils/receiptScan/prepareImage.ts im Browser: höchstens ~3 MP, JPEG 0,82.
    const meta = await sharp(full).metadata()
    const turned = (meta.orientation ?? 1) >= 5 // EXIF-Drehung um 90°: Breite und Höhe tauschen
    const w = (turned ? meta.height : meta.width)!
    const h = (turned ? meta.width : meta.height)!
    const scale = Math.min(1, Math.sqrt(3_000_000 / (w * h)), 3000 / Math.max(w, h))
    const buf = await sharp(full).rotate().resize({ width: Math.round(w * scale) }).jpeg({ quality: 82 }).toBuffer()
    return { mimeType: 'image/jpeg', base64: buf.toString('base64') }
}

const mark = (ok: boolean) => (ok ? '✓' : '✗')
const line = (s: ReceiptScore) =>
    `Laden ${mark(s.store)} Datum ${mark(s.date)} Summe ${mark(s.total)} Kat. ${mark(s.category)} | Artikel ${s.itemsCorrect}/${s.itemsExpected} (Menge ${s.quantitiesCorrect}) erfunden ${s.extra.length}`

it('Bon-Auswertung gegen Sollwerte', async () => {
    const labels = JSON.parse(fs.readFileSync(path.join(DIR, 'labels.json'), 'utf8')) as { receipts: ExpectedReceipt[] }
    const cases = labels.receipts.filter((r) => !ONLY || r.file.includes(ONLY))
    const report: Record<string, unknown>[] = []
    const before: ReceiptScore[] = []
    const after: ReceiptScore[] = []

    for (const expected of cases) {
        const t0 = Date.now()
        try {
            const out = await analyzeReceipt([await load(expected.file)], { now: new Date(), deadlineAt: Date.now() + 165_000 })
            const s1 = scoreReceipt(expected, out.first.result)
            const s2 = scoreReceipt(expected, out.result)
            before.push(s1)
            after.push(s2)
            const secs = ((Date.now() - t0) / 1000).toFixed(1)
            console.log(`\n${expected.file} — ${out.model}, ${secs} s, ${out.usage?.total ?? '?'} Tokens, Selbstkorrektur: ${out.review}`)
            console.log(`  vorher:  ${line(s1)}`)
            if (out.review !== 'none') console.log(`  nachher: ${line(s2)}`)
            if (s2.missing.length) console.log(`  fehlt:   ${s2.missing.join(', ')}`)
            if (s2.extra.length) console.log(`  zuviel:  ${s2.extra.join(', ')}`)
            report.push({ file: expected.file, model: out.model, seconds: Number(secs), usage: out.usage, review: out.review, before: s1, after: s2, result: out.result, findings: out.findings })
        } catch (err) {
            console.log(`\n${expected.file} — FEHLER: ${err instanceof Error ? err.message : err}`)
            report.push({ file: expected.file, error: err instanceof Error ? err.message : String(err) })
        }
    }

    const sumBefore = summarize(before)
    const sumAfter = summarize(after)
    console.log('\n==== Zusammenfassung ====')
    console.log('vor Selbstkorrektur: ', JSON.stringify(sumBefore))
    console.log('nach Selbstkorrektur:', JSON.stringify(sumAfter))

    const outDir = path.join(DIR, 'eval-reports')
    fs.mkdirSync(outDir, { recursive: true })
    const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(file, JSON.stringify({ models: process.env.GEMINI_MODELS ?? 'Standard', summary: { before: sumBefore, after: sumAfter }, receipts: report }, null, 2))
    console.log(`Bericht: ${file}`)
}, 30 * 60_000)
