
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

async function main() {
    console.log('Adding valid_from column to accounts table...');

    try {
        await db.execute(sql`
            ALTER TABLE accounts 
            ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE;
        `);
        console.log('Successfully added valid_from column.');
    } catch (error) {
        console.error('Error adding column:', error);
    } finally {
        await client.end();
    }
}

main();
