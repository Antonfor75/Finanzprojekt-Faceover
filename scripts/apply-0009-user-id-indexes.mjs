// Spielt NUR drizzle/0009_user_id_indexes.sql ein (rein additiv, legt nur Indizes an).
//
//   node scripts/apply-0009-user-id-indexes.mjs --dry-run   # in einer Transaktion anlegen, prüfen, ROLLBACK
//   node scripts/apply-0009-user-id-indexes.mjs             # wirklich einspielen
//
// Nicht über `drizzle-kit migrate` — die Migrations-Buchführung ist hier leer.
// Der Direkt-Host aus DATABASE_URL ist nur per IPv6 erreichbar; ohne IPv6 auf den
// Session-Pooler (IPv4) ausweichen: POOLER_HOST=aws-1-eu-west-1.pooler.supabase.com
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

async function runMigration(tx) {
    const file = await fs.readFile('drizzle/0009_user_id_indexes.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

async function listIndexes(db) {
    const rows = await db`
        select tablename, indexname from pg_indexes
        where schemaname = 'public' and indexname like '%\_user\_id\_idx'
        order by tablename`
    console.log(`\nuser_id-Indizes: ${rows.length}`)
    for (const r of rows) console.log('  ', r.tablename, '→', r.indexname)
    return rows.length
}

class Rollback extends Error {}

try {
    if (dryRun) {
        try {
            await sql.begin(async (tx) => {
                await runMigration(tx)
                if (await listIndexes(tx) < 9) throw new Error('Nicht alle 9 Indizes vorhanden')
                throw new Rollback()
            })
        } catch (e) {
            if (!(e instanceof Rollback)) throw e
        }
        console.log('\nDry-Run fertig — alles zurückgerollt, die DB ist unverändert.')
    } else {
        await sql.begin(runMigration)
        await listIndexes(sql)
    }
} finally {
    await sql.end()
}
