
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { sql } from 'drizzle-orm';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL not found in .env');
    process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

async function wipeAllData() {
    console.log('🔥 WARNING: This will delete ALL data from expenses, fixed_costs, accounts, and settings.');
    console.log('⏳ Starting wipe...');

    try {
        // Using TRUNCATE is faster and cleaner for wiping tables. 
        // Checks foreign keys and effectively resets tables.
        // We do NOT delete from 'auth.users', only application data.
        await db.execute(sql`TRUNCATE TABLE expenses, fixed_costs, accounts, settings RESTART IDENTITY CASCADE;`);

        console.log('✅ SUCCESS: All application data has been wiped.');
    } catch (err: any) {
        console.error('❌ Failed to wipe data:', err.message);
    } finally {
        await client.end();
    }
}

wipeAllData();
