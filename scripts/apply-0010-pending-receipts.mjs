// Spielt NUR drizzle/0010_pending_receipts.sql ein (neue Tabelle + privater Storage-Bucket).
//
//   node scripts/apply-0010-pending-receipts.mjs --dry-run   # in einer Transaktion anlegen, prüfen, ROLLBACK
//   node scripts/apply-0010-pending-receipts.mjs             # wirklich einspielen
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
    const file = await fs.readFile('drizzle/0010_pending_receipts.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

async function check(db) {
    const [t] = await db`
        select has_table_privilege('authenticated', 'public.pending_receipts', 'SELECT') as auth_select,
               has_table_privilege('authenticated', 'public.pending_receipts', 'INSERT') as auth_insert,
               has_table_privilege('service_role', 'public.pending_receipts', 'INSERT') as service_insert,
               has_column_privilege('authenticated', 'public.pending_receipts', 'edits', 'UPDATE') as auth_update_edits,
               has_column_privilege('authenticated', 'public.pending_receipts', 'image_paths', 'UPDATE') as auth_update_paths`
    const policies = await db`select policyname from pg_policies where tablename = 'pending_receipts' order by 1`
    const [bucket] = await db`select id, public from storage.buckets where id = 'receipt-scans'`
    console.log('\nRechte:', t)
    console.log('Policies:', policies.map(p => p.policyname).join(', '))
    console.log('Bucket:', bucket ?? 'FEHLT')
    return t.auth_select && !t.auth_insert && t.service_insert && t.auth_update_edits && !t.auth_update_paths && policies.length === 3 && bucket && !bucket.public
}

class Rollback extends Error {}

try {
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
        // Schema-Cache von PostgREST neu laden, sonst kennt die API die Tabelle nicht.
        await sql`NOTIFY pgrst, 'reload schema'`
        console.log('\nEingespielt, Schema-Cache neu geladen.')
    }
} finally {
    await sql.end()
}
