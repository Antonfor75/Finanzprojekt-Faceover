/**
 * Dry-Run zur Kalibrierung des Artikel-Parsers — liest nur, schreibt NICHTS.
 *
 * Holt alle REWE-Mails aus dem verbundenen Postfach, parst pro Bon die Artikel
 * aus dem PDF und vergleicht die Artikelsumme mit dem Bon-Gesamtbetrag.
 * Mit --lines werden zusätzlich die rohen PDF-Zeilen des ersten Bons geprintet
 * (zum Justieren der Regex-Muster).
 *
 * Aufruf:  npx tsx scripts/rewe-items-test.ts [--lines]
 */
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
const postgres = require('postgres')

for (const file of ['.env', '.env.local']) {
    const p = path.resolve(process.cwd(), file)
    if (fs.existsSync(p)) dotenv.config({ path: p })
}

import { decryptSecret } from '../utils/crypto'
import { fetchReweMessages } from '../utils/mailbox'
import { parseReweEmail, extractPdfLines, parseReweItems } from '../utils/parseReweEmail'

const SHOW_LINES = process.argv.includes('--lines')

async function main() {
    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: 'require', connect_timeout: 20, onnotice: () => { } })
    const [conn] = await sql`select email_address, secret_encrypted from email_connections limit 1`
    await sql.end()
    if (!conn) {
        console.error('Keine email_connections-Zeile gefunden.')
        process.exit(1)
    }

    const password = decryptSecret(conn.secret_encrypted)
    const messages = await fetchReweMessages({ email: conn.email_address, password }, undefined)
    console.log(`Gefunden: ${messages.length} Mail(s)\n${'='.repeat(64)}`)

    let okCount = 0
    let firstPdfShown = false

    for (const m of messages) {
        const pdf = m.attachments.find(
            (a) => a.contentType?.toLowerCase().includes('pdf') || a.filename?.toLowerCase().endsWith('.pdf'),
        )

        if (SHOW_LINES && pdf && !firstPdfShown) {
            firstPdfShown = true
            console.log(`\n### ROHE PDF-ZEILEN (${m.subject}) ###`)
            const lines = await extractPdfLines(pdf.content)
            lines.forEach((l, i) => console.log(`${String(i).padStart(3)}| ${l}`))
            console.log(`### ENDE ROHE ZEILEN ###\n`)
        }

        const parsed = await parseReweEmail(m)
        if (!parsed) {
            console.log(`\n✗ ${m.subject} — GESAMTBETRAG NICHT ERKANNT`)
            continue
        }

        const items = parsed.items ?? []
        const itemSum = items.reduce((s, it) => s + it.totalPrice, 0)
        const diff = Math.abs(itemSum - parsed.totalAmount)
        const ok = items.length > 0 && diff <= 0.01
        if (ok) okCount++

        console.log(`\n${ok ? '✓' : '✗'} ${m.subject}`)
        console.log(`  Bon-Summe: ${parsed.totalAmount.toFixed(2)} €  |  Artikelsumme: ${itemSum.toFixed(2)} €  |  Artikel: ${items.length}${ok ? '' : `  |  Diff: ${diff.toFixed(2)} €`}`)
        for (const it of items) {
            const qty = it.unit ? ` (${it.quantity} ${it.unit}${it.unitPrice ? ` × ${it.unitPrice.toFixed(2)}` : ''})` : ''
            console.log(`    - ${it.nameRaw}${qty}: ${it.totalPrice.toFixed(2)} €`)
        }
    }

    console.log(`\n${'='.repeat(64)}\nPlausibel (Artikelsumme = Bon-Summe): ${okCount}/${messages.length}`)
    process.exit(0)
}

main().catch((err) => {
    console.error('Fehler:', err)
    process.exit(1)
})
