// Spielt NUR drizzle/0011_drop_rewe_tables.sql ein (löscht die leeren REWE-Tabellen).
//
//   node scripts/apply-0011-drop-rewe-tables.mjs --dry-run   # in einer Transaktion löschen, prüfen, ROLLBACK
//   node scripts/apply-0011-drop-rewe-tables.mjs             # wirklich einspielen
//
// Bricht ab, falls eine der Tabellen noch Zeilen hat — gelöscht werden nur leere Tabellen.
// Ohne IPv6: POOLER_HOST=aws-1-eu-west-1.pooler.supabase.com
import 'dotenv/config'
import fs from 'node:fs/promises'
import postgres from 'postgres'

const dryRun = process.argv.includes('--dry-run')

function connectionUrl() {
    const url = new URL(process.env.DATABASE_URL)
    const poolerHost = process.env.POOLER_HOST
    if (poolerHost && url.hostname.startsWith('db.')) {
        const ref = url.hostname.split('.')[1]
        url.hostname = poolerHost
        url.username = `postgres.${ref}`
    }
    return url.toString()
}

const sql = postgres(connectionUrl(), { ssl: 'require', max: 1 })

async function counts(db) {
    const [c] = await db`select (select count(*) from expenses)::int expenses, (select count(*) from receipt_items)::int items`
    return c
}

async function runMigration(tx) {
    for (const t of ['email_connections', 'rewe_receipts']) {
        const [{ exists }] = await tx`select to_regclass(${'public.' + t}) is not null as exists`
        if (!exists) continue
        const [{ n }] = await tx.unsafe(`select count(*)::int as n from "${t}"`)
        if (n > 0) throw new Error(`${t} hat noch ${n} Zeilen — Abbruch, nichts gelöscht.`)
    }
    const file = await fs.readFile('drizzle/0011_drop_rewe_tables.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

async function check(db) {
    const [r] = await db`select to_regclass('public.email_connections') is null as conn_weg, to_regclass('public.rewe_receipts') is null as rewe_weg`
    console.log('Tabellen weg:', r)
    return r.conn_weg && r.rewe_weg
}

class Rollback extends Error {}

try {
    const before = await counts(sql)
    console.log('Vorher:', before)
    if (dryRun) {
        try {
            await sql.begin(async (tx) => {
                await runMigration(tx)
                if (!(await check(tx))) throw new Error('Prüfung fehlgeschlagen')
                throw new Rollback()
            })
        } catch (e) {
            if (!(e instanceof Rollback)) throw e
        }
        console.log('\nDry-Run fertig — alles zurückgerollt, die DB ist unverändert.')
    } else {
        await sql.begin(runMigration)
        if (!(await check(sql))) throw new Error('Prüfung nach dem Einspielen fehlgeschlagen')
        const after = await counts(sql)
        console.log('Nachher:', after)
        if (after.expenses !== before.expenses || after.items !== before.items) throw new Error('Ausgaben/Artikel haben sich verändert!')
        await sql`NOTIFY pgrst, 'reload schema'`
        console.log('\nEingespielt, Schema-Cache neu geladen.')
    }
} finally {
    await sql.end()
}
