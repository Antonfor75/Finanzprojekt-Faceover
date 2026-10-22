// Spielt NUR drizzle/0014_friends_scan_only.sql ein (Freunde nur für Konten mit Kassenbon-Scan:
// ersetzt set_my_handle, send_friend_request und respond_friend_request aus 0012 und legt die
// Hilfe has_receipt_scan an). Setzt 0012 und 0013 voraus.
//
//   node scripts/apply-0014-friends-scan-only.mjs --dry-run   # in einer Transaktion anlegen, prüfen, ROLLBACK
//   node scripts/apply-0014-friends-scan-only.mjs             # wirklich einspielen
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

const sql = postgres(connectionUrl(), { ssl: 'require', max: 1, onnotice: () => {} })

async function runMigration(tx) {
    const [{ ready }] = await tx`select to_regclass('public.friendships') is not null and to_regclass('public.shared_purchases') is not null as ready`
    if (!ready) throw new Error('0012/0013 (Freundschaften und geteilte Einkäufe) sind noch nicht eingespielt.')
    const file = await fs.readFile('drizzle/0014_friends_scan_only.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

async function check(db) {
    const [t] = await db`
        select has_function_privilege('authenticated', 'set_my_handle(text)', 'EXECUTE') as auth_set_handle,
               has_function_privilege('authenticated', 'send_friend_request(text)', 'EXECUTE') as auth_send,
               has_function_privilege('authenticated', 'respond_friend_request(uuid,boolean)', 'EXECUTE') as auth_respond,
               not has_function_privilege('anon', 'send_friend_request(text)', 'EXECUTE') as anon_send_denied,
               not has_function_privilege('authenticated', 'has_receipt_scan(uuid)', 'EXECUTE') as auth_helper_denied,
               not has_function_privilege('anon', 'has_receipt_scan(uuid)', 'EXECUTE') as anon_helper_denied,
               has_function_privilege('service_role', 'has_receipt_scan(uuid)', 'EXECUTE') as service_helper`
    const [c] = await db`
        select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prosecdef
                    and p.proname in ('has_receipt_scan', 'set_my_handle', 'send_friend_request', 'respond_friend_request')
                    and p.proconfig @> array['search_path=public, pg_temp']) = 4 as definer_search_path,
               (select prosrc like '%has_receipt_scan%' from pg_proc where proname = 'send_friend_request' and pronamespace = 'public'::regnamespace) as send_gated`
    console.log('\nRechte:', t)
    console.log('Funktionen:', c)
    return Object.values(t).every(Boolean) && Object.values(c).every(Boolean)
}

class Rollback extends Error {}

try {
    // Prüfung und Schema-Reload laufen INNERHALB der Transaktion: schlägt die Prüfung fehl, wird nichts übernommen.
    try {
        await sql.begin(async (tx) => {
            await runMigration(tx)
            if (!(await check(tx))) throw new Error('Prüfung fehlgeschlagen')
            await tx`NOTIFY pgrst, 'reload schema'`
            if (dryRun) throw new Rollback()
        })
    } catch (e) {
        if (!(e instanceof Rollback)) throw e
    }
    console.log(dryRun
        ? '\nROLLBACK — Dry-Run fertig, alles zurückgerollt, die DB ist unverändert.'
        : '\nEingespielt, Schema-Cache neu geladen.')
} finally {
    await sql.end()
}
