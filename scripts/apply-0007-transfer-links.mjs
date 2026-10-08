// Spielt NUR drizzle/0007_transfer_links.sql ein (Umbuchungen Girokonto <-> Spaßkonto).
// Grund: drizzle.__drizzle_migrations ist leer, ein `drizzle-kit migrate` würde bei 0000 kollidieren
// (siehe scripts/apply-0005-invite-codes.mjs). Die Migration ist idempotent (IF NOT EXISTS).
import 'dotenv/config'
import fs from 'node:fs/promises'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
    const file = await fs.readFile('drizzle/0007_transfer_links.sql', 'utf-8')
    for (const stmt of file.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (!trimmed) continue
        await sql.unsafe(trimmed)
        console.log('OK:', trimmed.split('\n').find((l) => !l.startsWith('--'))?.slice(0, 80))
    }

    const cols = await sql`
        select table_name, column_name, data_type
        from information_schema.columns
        where table_schema = 'public' and column_name = 'transfer_id'
        order by table_name`
    console.log('\nSpalten transfer_id (erwartet: 4 Tabellen):')
    for (const c of cols) console.log('  ', c.table_name, '|', c.data_type)
} finally {
    await sql.end()
}
