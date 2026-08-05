// Spielt NUR drizzle/0005_invite_codes.sql ein.
// Grund: drizzle.__drizzle_migrations ist leer (die Tabellen wurden seinerzeit per
// push/SQL-Editor angelegt), ein `drizzle-kit migrate` würde bei 0000 kollidieren.
import 'dotenv/config'
import fs from 'node:fs/promises'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
    const file = await fs.readFile('drizzle/0005_invite_codes.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await sql.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n')[0].slice(0, 70))
    }

    const cols = await sql`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = 'invite_codes'
        order by ordinal_position`
    console.log('\ninvite_codes columns:')
    for (const c of cols) console.log('  ', c.column_name, '|', c.data_type, '| nullable:', c.is_nullable)

    const rls = await sql`select relrowsecurity from pg_class where relname = 'invite_codes'`
    console.log('\nRLS enabled?', rls[0]?.relrowsecurity)

    const pol = await sql`select policyname from pg_policies where tablename = 'invite_codes'`
    console.log('policies (should be none):', pol.length)
} finally {
    await sql.end()
}
