/**
 * Dry-Run zum Kalibrieren des REWE-Parsers — schreibt NICHTS in die DB.
 *
 * Verbindet sich mit einem Gmail-Postfach (Test-Zugangsdaten aus der .env),
 * sucht REWE-eBon-Mails und zeigt pro Mail den erkannten Gesamtbetrag + Datum.
 * Damit lassen sich die Regex-Muster in utils/parseReweEmail.ts gegen das echte
 * REWE-Format abgleichen, bevor der Live-Sync/Cron aktiviert wird.
 *
 * Aufruf:
 *   npx tsx scripts/rewe-sync-test.ts
 *
 * Benötigte .env-Variablen (nur für diesen Test):
 *   REWE_TEST_EMAIL=deine.adresse@gmail.com
 *   REWE_TEST_APP_PASSWORD=xxxxxxxxxxxxxxxx   (Google-App-Passwort)
 *   REWE_TEST_LOOKBACK_DAYS=90                (optional, Standard 90)
 */
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fetchReweMessages } from '../utils/mailbox'
import { parseReweEmail } from '../utils/parseReweEmail'

for (const file of ['.env', '.env.local']) {
    const p = path.resolve(process.cwd(), file)
    if (fs.existsSync(p)) dotenv.config({ path: p })
}

async function main() {
    const email = process.env.REWE_TEST_EMAIL
    const password = process.env.REWE_TEST_APP_PASSWORD?.replace(/\s+/g, '')

    if (!email || !password) {
        console.error('Bitte REWE_TEST_EMAIL und REWE_TEST_APP_PASSWORD in .env setzen.')
        process.exit(1)
    }

    const lookbackDays = Number(process.env.REWE_TEST_LOOKBACK_DAYS || '90')
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)

    console.log(`\nSuche REWE-Mails in ${email} seit ${since.toISOString().slice(0, 10)} …\n`)

    const messages = await fetchReweMessages({ email, password }, since)
    console.log(`Gefunden: ${messages.length} Mail(s)\n${'='.repeat(50)}`)

    let recognized = 0
    for (const m of messages) {
        const parsed = await parseReweEmail(m)
        if (parsed) recognized++
        console.log(`\n• ${m.subject || '(kein Betreff)'}`)
        console.log(`  Mail-Datum:   ${m.date?.toISOString() ?? '?'}`)
        console.log(`  Attachments:  ${m.attachments.map((a) => a.filename || a.contentType).join(', ') || 'keine'}`)
        console.log(`  → Betrag:     ${parsed ? parsed.totalAmount.toFixed(2) + ' €' : 'NICHT ERKANNT ⚠'}`)
        console.log(`  → Bon-Datum:  ${parsed?.receiptDate ?? '—'}`)
    }

    console.log(`\n${'='.repeat(50)}`)
    console.log(`Erkannt: ${recognized}/${messages.length}. (Keine DB-Änderungen — reiner Dry-Run.)\n`)
    process.exit(0)
}

main().catch((err) => {
    console.error('Fehler:', err)
    process.exit(1)
})
