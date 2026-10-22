// Spielt NUR drizzle/0013_shared_purchases.sql ein (Teilungen: Tabelle shared_purchases, neue Spalten an
// expenses/receipt_items und die RPC-Funktionen save_share / unshare / delete_shared / mark_shares_seen;
// ersetzt außerdem friend_state_for und end_friendship aus 0012). Setzt 0012 voraus.
//
//   node scripts/apply-0013-shared-purchases.mjs --dry-run   # in einer Transaktion anlegen, prüfen, ROLLBACK
//   node scripts/apply-0013-shared-purchases.mjs             # wirklich einspielen
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

async function runFile(tx, path) {
    const file = await fs.readFile(path, 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

async function runMigration(tx) {
    const [{ has0012 }] = await tx`select to_regclass('public.friendships') is not null and to_regclass('public.profiles') is not null as "has0012"`
    if (!has0012) {
        if (!dryRun) throw new Error('0012 (Kontonamen und Freundschaften) ist noch nicht eingespielt — zuerst scripts/apply-0012-friendships.mjs ausführen.')
        // Im Dry-Run läuft 0012 in derselben (zurückgerollten) Transaktion vorweg, damit 0013 geprüft werden kann.
        console.log('Hinweis: 0012 ist live noch nicht eingespielt — im Dry-Run wird es vorweg mit zurückgerollt.')
        await runFile(tx, 'drizzle/0012_friendships.sql')
    }
    await runFile(tx, 'drizzle/0013_shared_purchases.sql')
}

async function check(db) {
    const [t] = await db`
        select has_table_privilege('authenticated', 'public.shared_purchases', 'SELECT') as sp_auth_select,
               not has_table_privilege('authenticated', 'public.shared_purchases', 'INSERT') as sp_auth_insert_denied,
               not has_table_privilege('authenticated', 'public.shared_purchases', 'UPDATE') as sp_auth_update_denied,
               not has_table_privilege('authenticated', 'public.shared_purchases', 'DELETE') as sp_auth_delete_denied,
               has_table_privilege('service_role', 'public.shared_purchases', 'INSERT') as sp_service_insert,
               not has_table_privilege('anon', 'public.shared_purchases', 'SELECT') as sp_anon_select_denied,
               has_function_privilege('authenticated', 'save_share(integer,text,numeric,numeric,jsonb)', 'EXECUTE') as auth_save_share,
               has_function_privilege('authenticated', 'unshare(uuid)', 'EXECUTE') as auth_unshare,
               has_function_privilege('authenticated', 'delete_shared(uuid)', 'EXECUTE') as auth_delete_shared,
               has_function_privilege('authenticated', 'mark_shares_seen()', 'EXECUTE') as auth_mark_seen,
               has_function_privilege('authenticated', 'end_friendship()', 'EXECUTE') as auth_end_friendship,
               not has_function_privilege('anon', 'save_share(integer,text,numeric,numeric,jsonb)', 'EXECUTE') as anon_save_share_denied,
               not has_function_privilege('anon', 'end_friendship()', 'EXECUTE') as anon_end_friendship_denied,
               not has_function_privilege('authenticated', 'share_normalize_items(jsonb)', 'EXECUTE') as auth_internal_helper_denied,
               not has_function_privilege('authenticated', 'friend_state_for(uuid)', 'EXECUTE') as auth_state_helper_denied`
    const [c] = await db`
        select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'expenses'
                  and column_name in ('shared_purchase_id', 'share_total', 'share_mode', 'share_note')) = 4 as expenses_columns,
               (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'receipt_items'
                  and column_name in ('shared_purchase_id', 'shared_away')) = 2 as receipt_items_columns,
               (select count(*) from pg_constraint where contype = 'f' and confrelid = 'public.shared_purchases'::regclass and confdeltype = 'n') = 2 as set_null_fks,
               (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prosecdef
                    and p.proname in ('save_share', 'unshare', 'delete_shared', 'mark_shares_seen', 'end_friendship', 'friend_state_for')
                    and p.proconfig @> array['search_path=public, pg_temp']) = 6 as definer_search_path`
    const policies = await db`select tablename, policyname from pg_policies where tablename = 'shared_purchases' order by 1, 2`
    console.log('\nRechte:', t)
    console.log('Spalten und Funktionen:', c)
    console.log('Policies:', policies.map(p => `${p.tablename}.${p.policyname}`).join(', '))
    return Object.values(t).every(Boolean) && Object.values(c).every(Boolean) && policies.length === 1
}

class Rollback extends Error {}

try {
    // Prüfung und Schema-Reload laufen INNERHALB der Transaktion: schlägt die Prüfung fehl, wird nichts übernommen.
    // (NOTIFY wird erst beim COMMIT zugestellt, im Dry-Run also nie.)
    try {
        await sql.begin(async (tx) => {
            await runMigration(tx)
            if (!(await check(tx))) throw new Error('Prüfung fehlgeschlagen')
            // Schema-Cache von PostgREST neu laden, sonst kennt die API Tabelle und Spalten nicht.
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
