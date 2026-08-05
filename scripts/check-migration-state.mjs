// Einmal-Check: Ist die Drizzle-Migrationsbuchführung in der DB in Sync?
import 'dotenv/config'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
    try {
        const m = await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
        console.log('applied migrations:', m.length)
        for (const r of m) console.log('  ', new Date(Number(r.created_at)).toISOString(), r.hash.slice(0, 12))
    } catch (e) {
        console.log('no drizzle.__drizzle_migrations →', e.message)
    }
    const inv = await sql`select to_regclass('public.invite_codes') as t`
    console.log('invite_codes exists?', inv[0].t)
} finally {
    await sql.end()
}
