// Spielt NUR drizzle/0012_friendships.sql ein (Kontonamen + Freundschaften: zwei Tabellen und die RPC-Funktionen).
//
//   node scripts/apply-0012-friendships.mjs --dry-run   # in einer Transaktion anlegen, prüfen, ROLLBACK
//   node scripts/apply-0012-friendships.mjs             # wirklich einspielen
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
    const file = await fs.readFile('drizzle/0012_friendships.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

async function check(db) {
    const [t] = await db`
        select has_table_privilege('authenticated', 'public.profiles', 'SELECT') as profiles_auth_select,
               not has_table_privilege('authenticated', 'public.profiles', 'INSERT') as profiles_auth_insert_denied,
               has_table_privilege('service_role', 'public.profiles', 'INSERT') as profiles_service_insert,
               has_table_privilege('authenticated', 'public.friendships', 'SELECT') as friendships_auth_select,
               not has_table_privilege('authenticated', 'public.friendships', 'INSERT') as friendships_auth_insert_denied,
               has_table_privilege('service_role', 'public.friendships', 'INSERT') as friendships_service_insert,
               has_function_privilege('authenticated', 'send_friend_request(text)', 'EXECUTE') as auth_send_request,
               not has_function_privilege('anon', 'send_friend_request(text)', 'EXECUTE') as anon_send_request_denied,
               not has_function_privilege('authenticated', 'friend_state_for(uuid)', 'EXECUTE') as auth_internal_helper_denied`
    const policies = await db`select tablename, policyname from pg_policies where tablename in ('profiles', 'friendships') order by 1, 2`
    console.log('\nRechte:', t)
    console.log('Policies:', policies.map(p => `${p.tablename}.${p.policyname}`).join(', '))
    return t.profiles_auth_select && t.profiles_auth_insert_denied && t.profiles_service_insert
        && t.friendships_auth_select && t.friendships_auth_insert_denied && t.friendships_service_insert
        && t.auth_send_request && t.anon_send_request_denied && t.auth_internal_helper_denied
        && policies.length === 2
}

class Rollback extends Error {}

try {
    // Prüfung und Schema-Reload laufen INNERHALB der Transaktion: schlägt die Prüfung fehl, wird nichts übernommen.
    // (NOTIFY wird erst beim COMMIT zugestellt, im Dry-Run also nie.)
    try {
        await sql.begin(async (tx) => {
            await runMigration(tx)
            if (!(await check(tx))) throw new Error('Prüfung fehlgeschlagen')
            // Schema-Cache von PostgREST neu laden, sonst kennt die API die Tabellen nicht.
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
