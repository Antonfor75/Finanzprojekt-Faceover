// Nach DDL kennt die Supabase-API (PostgREST) neue Tabellen/Spalten erst nach
// einem Schema-Cache-Reload. Das hier stößt ihn an.
import 'dotenv/config'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
    await sql.unsafe(`NOTIFY pgrst, 'reload schema'`)
    console.log('Schema-Reload angestoßen.')
} finally {
    await sql.end()
}
