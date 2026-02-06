import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function repairSchema() {
    try {
        console.log('Creating budget_logs table manually...');

        await sql`
            CREATE TABLE IF NOT EXISTS budget_logs (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                amount NUMERIC NOT NULL,
                user_id UUID NOT NULL DEFAULT auth.uid()
            )
        `;

        console.log('Enabling RLS on budget_logs...');
        await sql`ALTER TABLE budget_logs ENABLE ROW LEVEL SECURITY`;

        console.log('Creating Policies...');
        await sql.unsafe(`
            DROP POLICY IF EXISTS "Users can view own budget logs" ON budget_logs;
            CREATE POLICY "Users can view own budget logs" ON budget_logs FOR SELECT USING (auth.uid() = user_id);

            DROP POLICY IF EXISTS "Users can insert own budget logs" ON budget_logs;
            CREATE POLICY "Users can insert own budget logs" ON budget_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

            DROP POLICY IF EXISTS "Users can update own budget logs" ON budget_logs;
            CREATE POLICY "Users can update own budget logs" ON budget_logs FOR UPDATE USING (auth.uid() = user_id);

            DROP POLICY IF EXISTS "Users can delete own budget logs" ON budget_logs;
            CREATE POLICY "Users can delete own budget logs" ON budget_logs FOR DELETE USING (auth.uid() = user_id);
        `);

        // Refresh cache hint? No direct way, but often a schema change triggers it.
        // We will also just run a dummy select to 'warm' it if possible, though PostgREST cache usually needs a reload or timeout.
        // Actually, Notify User "If error persists, reload" is best.

        console.log('✅ budget_logs table created/verified and secured.');

    } catch (e) {
        console.error('Repair failed:', e);
    } finally {
        await sql.end();
    }
}
repairSchema();
