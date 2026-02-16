
import postgres from 'postgres'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
}

const sql = postgres(connectionString)

async function fix() {
    console.log('Checking fixed_costs table...')

    // Check if column exists
    const [cols] = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'fixed_costs' AND column_name = 'account_id'
    `

    if (!cols) {
        console.log('Column account_id missing. Adding it...')
        await sql`ALTER TABLE fixed_costs ADD COLUMN account_id integer`
        console.log('Column added.')
    } else {
        console.log('Column account_id already exists.')
    }

    // Reload PostgREST schema cache
    console.log('Reloading schema cache...')
    await sql`NOTIFY pgrst, 'reload schema'`
    console.log('Schema cache reload triggered.')

    await sql.end()
}

fix().catch(e => {
    console.error(e)
    process.exit(1)
})
