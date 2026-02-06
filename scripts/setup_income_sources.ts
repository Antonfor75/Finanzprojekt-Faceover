import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function setupIncomeSources() {
    try {
        console.log('1. Creating income_sources table...');
        await sql`
            CREATE TABLE IF NOT EXISTS income_sources (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                title TEXT NOT NULL,
                amount NUMERIC NOT NULL,
                user_id UUID NOT NULL DEFAULT auth.uid()
            )
        `;

        console.log('2. Enabling RLS...');
        await sql`ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY`;

        console.log('3. Creating Policies...');
        await sql.unsafe(`
            DROP POLICY IF EXISTS "Users can view own income sources" ON income_sources;
            CREATE POLICY "Users can view own income sources" ON income_sources FOR SELECT USING (auth.uid() = user_id);

            DROP POLICY IF EXISTS "Users can insert own income sources" ON income_sources;
            CREATE POLICY "Users can insert own income sources" ON income_sources FOR INSERT WITH CHECK (auth.uid() = user_id);

            DROP POLICY IF EXISTS "Users can update own income sources" ON income_sources;
            CREATE POLICY "Users can update own income sources" ON income_sources FOR UPDATE USING (auth.uid() = user_id);

            DROP POLICY IF EXISTS "Users can delete own income sources" ON income_sources;
            CREATE POLICY "Users can delete own income sources" ON income_sources FOR DELETE USING (auth.uid() = user_id);
        `);

        console.log('4. Granting Permissions...');
        await sql.unsafe(`
            GRANT ALL ON TABLE income_sources TO authenticated;
            GRANT ALL ON TABLE income_sources TO service_role;
            GRANT ALL ON SEQUENCE income_sources_id_seq TO authenticated;
            GRANT ALL ON SEQUENCE income_sources_id_seq TO service_role;
        `);

        console.log('5. Migrating Data (Converting latest Budget Log to Income Source)...');
        // We find the LATEST budget log for each user and insert it as an income source
        // This query uses DISTINCT ON to get the latest per user
        await sql.unsafe(`
            INSERT INTO income_sources (title, amount, user_id)
            SELECT 'Gehalt (Basis)', amount, user_id
            FROM (
                SELECT DISTINCT ON (user_id) amount, user_id, created_at
                FROM budget_logs
                ORDER BY user_id, created_at DESC
            ) as latest_budgets
            WHERE amount > 0
            AND NOT EXISTS (
                SELECT 1 FROM income_sources WHERE user_id = latest_budgets.user_id
            )
        `);

        console.log('✅ Income Sources setup complete!');

    } catch (e) {
        console.error('Setup failed:', e);
    } finally {
        await sql.end();
    }
}
setupIncomeSources();
