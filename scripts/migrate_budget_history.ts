import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function migrateBudget() {
    try {
        console.log('Securing budget_logs...');
        const rlsSql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'secure_budget_logs.sql'), 'utf8');
        await sql.unsafe(rlsSql);

        console.log('Migrating existing settings budgets to budget_logs...');
        // Insert into budget_logs select active user settings
        // Since we want to preserve who it belongs to, we use the user_id from settings
        await sql.unsafe(`
            INSERT INTO budget_logs (amount, user_id, created_at)
            SELECT monthly_budget, user_id, NOW()
            FROM settings
            WHERE monthly_budget IS NOT NULL
        `);

        console.log('✅ Budget migration complete!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await sql.end();
    }
}
migrateBudget();
