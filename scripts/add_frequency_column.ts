
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function run() {
    try {
        console.log('Adding frequency column to income_sources...');
        // Add frequency column with default 'monthly'
        await sql`ALTER TABLE income_sources ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'monthly'`;

        console.log('Done!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
