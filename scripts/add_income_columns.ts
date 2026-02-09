import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Try POSTGRES_URL first (often used in Vercel/Neon/Supabase setups), then DATABASE_URL
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('No POSTGRES_URL or DATABASE_URL found in .env');
    process.exit(1);
}

const sql = postgres(connectionString);

async function runMigration() {
    try {
        console.log('Starting Migration: Adding valid_from/valid_to to income_sources...');

        // 1. ADD COLUMNS
        console.log('Adding specific columns...');
        await sql`ALTER TABLE income_sources ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW() NOT NULL`;
        await sql`ALTER TABLE income_sources ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ`;

        console.log('✅ Migration completed successfully!');

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await sql.end();
    }
}

runMigration();
