// Spielt NUR drizzle/0008_invite_code_multi_use.sql ein (rein additiv, löscht nichts).
//
//   node scripts/apply-0008-invite-multi-use.mjs --dry-run   # alles in einer Transaktion + Tests, dann ROLLBACK
//   node scripts/apply-0008-invite-multi-use.mjs             # wirklich einspielen
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
    const file = await fs.readFile('drizzle/0008_invite_code_multi_use.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await tx.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find(l => l && !l.startsWith('--'))?.slice(0, 80))
    }
}

// Prüft die Funktionen an Wegwerf-Codes. Läuft nur innerhalb der Dry-Run-
// Transaktion, die am Ende zurückgerollt wird — in der DB bleibt nichts zurück.
async function selfTest(tx) {
    const check = (label, ok) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
        if (!ok) throw new Error(`Selbsttest fehlgeschlagen: ${label}`)
    }
    const claim = async (code) => (await tx`select * from claim_invite_code(${code})`)[0]

    await tx`insert into invite_codes (code, max_uses) values ('TEST-MULT', 2)`
    await tx`insert into invite_codes (code, max_uses, expires_at) values ('TEST-EXPD', 5, now() - interval '1 day')`
    await tx`insert into invite_codes (code) values ('TEST-ONCE')`

    const a = await claim('TEST-MULT')
    const b = await claim('TEST-MULT')
    const c = await claim('TEST-MULT')
    check('1. Einlösung ok', a.status === 'ok')
    check('2. Einlösung ok', b.status === 'ok')
    check('3. Einlösung erschöpft', c.status === 'exhausted')
    const [mult] = await tx`select use_count, used_at from invite_codes where code = 'TEST-MULT'`
    check('Zähler 2, used_at gesetzt', mult.use_count === 2 && mult.used_at !== null)

    await tx`select release_invite_code(${a.code_id})`
    check('nach Freigabe wieder einlösbar', (await claim('TEST-MULT')).status === 'ok')

    check('abgelaufen erkannt', (await claim('TEST-EXPD')).status === 'expired')
    const [expd] = await tx`select use_count from invite_codes where code = 'TEST-EXPD'`
    check('abgelaufen zählt nicht hoch', expd.use_count === 0)

    check('unbekannter Code ungültig', (await claim('NOPE-NOPE')).status === 'invalid')

    check('Einmal-Code ok', (await claim('TEST-ONCE')).status === 'ok')
    check('Einmal-Code danach erschöpft', (await claim('TEST-ONCE')).status === 'exhausted')

    // Übergangszeit: alter Code setzt nur used_at → muss als erschöpft gelten.
    await tx`insert into invite_codes (code, used_at) values ('TEST-LEGC', now())`
    check('Altbestand (nur used_at) erschöpft', (await claim('TEST-LEGC')).status === 'exhausted')

    const roles = await tx`
        select r.rolname, has_function_privilege(r.rolname, 'public.claim_invite_code(text)', 'execute') as can
        from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')`
    for (const r of roles) {
        check(`claim_invite_code für ${r.rolname} ${r.rolname === 'service_role' ? 'erlaubt' : 'gesperrt'}`,
            r.can === (r.rolname === 'service_role'))
    }
    const tableRoles = await tx`
        select r.rolname, has_table_privilege(r.rolname, 'public.invite_code_redemptions', 'select') as can
        from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')`
    for (const r of tableRoles) {
        check(`invite_code_redemptions für ${r.rolname} ${r.rolname === 'service_role' ? 'lesbar' : 'gesperrt'}`,
            r.can === (r.rolname === 'service_role'))
    }
}

class Rollback extends Error {}

try {
    const [before] = await sql`select count(*)::int as n, count(used_at)::int as used from invite_codes`
    console.log(`invite_codes vorher: ${before.n} Codes, davon ${before.used} eingelöst\n`)

    if (dryRun) {
        try {
            await sql.begin(async (tx) => {
                await runMigration(tx)
                console.log('\n--- Selbsttest ---')
                await selfTest(tx)
                throw new Rollback()
            })
        } catch (e) {
            if (!(e instanceof Rollback)) throw e
        }
        console.log('\nDry-Run fertig — alles zurückgerollt, die DB ist unverändert.')
    } else {
        await sql.begin(runMigration)
        const [after] = await sql`
            select count(*)::int as n, sum(use_count)::int as uses,
                   (select count(*)::int from invite_code_redemptions) as redemptions
            from invite_codes`
        console.log(`\ninvite_codes nachher: ${after.n} Codes, ${after.uses} Nutzungen, ${after.redemptions} Einlösungen erfasst`)
    }
} finally {
    await sql.end()
}
