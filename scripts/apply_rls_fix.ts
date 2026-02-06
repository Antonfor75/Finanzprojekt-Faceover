
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { sql } from 'drizzle-orm';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function applyFix() {
    console.log('🛡️ Applying Strict RLS Policies...');

    const sqlContent = fs.readFileSync(path.join(__dirname, 'fix_rls_leak.sql'), 'utf-8');
    const statements = sqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);

    for (const statement of statements) {
        try {
            await db.execute(sql.raw(statement));
            process.stdout.write('.');
        } catch (err: any) {
            console.error('\n❌ Failed:', err.message);
            // console.error('Statement:', statement);
        }
    }
    console.log('\n✅ RLS Fix Applied.');
    process.exit(0);
}

applyFix();
