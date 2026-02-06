
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const client = postgres(process.env.DATABASE_URL!);

async function checkDefaults() {
    console.log('🔍 Checking Column Defaults...\n');

    const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];

    for (const table of tables) {
        const result = await client`
            SELECT column_name, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = ${table} AND column_name = 'user_id'
        `;

        const col = result[0];
        console.log(`Table: ${table}`);
        if (col) {
            console.log(`  - user_id Default: ${col.column_default || '❌ NONE'}`);
            console.log(`  - Nullable: ${col.is_nullable}`);
        } else {
            console.log(`  - user_id column NOT FOUND`);
        }
        console.log('');
    }

    process.exit(0);
}

checkDefaults();
