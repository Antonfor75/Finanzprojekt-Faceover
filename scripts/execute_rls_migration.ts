import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

const USER_ID = '40c57656-9f56-42e2-8be6-a91122b5660a';

async function runLegacyMigration() {
    try {
        console.log('Starting RLS Migration...');

        // 1. ADD COLUMNS (Safe to run multiple times)
        console.log('Adding columns...');
        await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid()`;
        await sql`ALTER TABLE fixed_costs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid()`;
        await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid()`;
        await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid()`;

        // 2. BACKFILL (Using literal ID)
        console.log(`Backfilling data for user ${USER_ID}...`);
        await sql`UPDATE expenses SET user_id = ${USER_ID} WHERE user_id IS NULL`;
        await sql`UPDATE fixed_costs SET user_id = ${USER_ID} WHERE user_id IS NULL`;
        await sql`UPDATE accounts SET user_id = ${USER_ID} WHERE user_id IS NULL`;
        await sql`UPDATE settings SET user_id = ${USER_ID} WHERE user_id IS NULL`;

        // 3. ENABLE RLS
        console.log('Enabling RLS...');
        await sql`ALTER TABLE expenses ENABLE ROW LEVEL SECURITY`;
        await sql`ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY`;
        await sql`ALTER TABLE accounts ENABLE ROW LEVEL SECURITY`;
        await sql`ALTER TABLE settings ENABLE ROW LEVEL SECURITY`;

        // 4. CLEANUP
        console.log('Cleaning up old policies...');
        // We can't use parameterized identifiers easily for policy names with postgres.js
        // So we use unsafe for DDL statements which is standard practice for migrations
        await sql.unsafe(`
            DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
            DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
            DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
            DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
            DROP POLICY IF EXISTS "policy_public_all_expenses" ON expenses;

            DROP POLICY IF EXISTS "Users can view own fixed_costs" ON fixed_costs;
            DROP POLICY IF EXISTS "Users can insert own fixed_costs" ON fixed_costs;
            DROP POLICY IF EXISTS "Users can update own fixed_costs" ON fixed_costs;
            DROP POLICY IF EXISTS "Users can delete own fixed_costs" ON fixed_costs;
            DROP POLICY IF EXISTS "policy_public_all_fixed_costs" ON fixed_costs;

            DROP POLICY IF EXISTS "Users can view own accounts" ON accounts;
            DROP POLICY IF EXISTS "Users can insert own accounts" ON accounts;
            DROP POLICY IF EXISTS "Users can update own accounts" ON accounts;
            DROP POLICY IF EXISTS "Users can delete own accounts" ON accounts;
            DROP POLICY IF EXISTS "policy_public_all_accounts" ON accounts;

            DROP POLICY IF EXISTS "Users can view own settings" ON settings;
            DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
            DROP POLICY IF EXISTS "Users can update own settings" ON settings;
            DROP POLICY IF EXISTS "Users can delete own settings" ON settings;
            DROP POLICY IF EXISTS "policy_public_all_settings" ON settings;
        `);

        // 5. NEW POLICIES
        console.log('Creating new policies...');
        await sql.unsafe(`
            -- EXPENSES
            CREATE POLICY "Users can view own expenses" ON expenses FOR SELECT USING (auth.uid() = user_id);
            CREATE POLICY "Users can insert own expenses" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
            CREATE POLICY "Users can update own expenses" ON expenses FOR UPDATE USING (auth.uid() = user_id);
            CREATE POLICY "Users can delete own expenses" ON expenses FOR DELETE USING (auth.uid() = user_id);

            -- FIXED COSTS
            CREATE POLICY "Users can view own fixed_costs" ON fixed_costs FOR SELECT USING (auth.uid() = user_id);
            CREATE POLICY "Users can insert own fixed_costs" ON fixed_costs FOR INSERT WITH CHECK (auth.uid() = user_id);
            CREATE POLICY "Users can update own fixed_costs" ON fixed_costs FOR UPDATE USING (auth.uid() = user_id);
            CREATE POLICY "Users can delete own fixed_costs" ON fixed_costs FOR DELETE USING (auth.uid() = user_id);

            -- ACCOUNTS
            CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING (auth.uid() = user_id);
            CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
            CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING (auth.uid() = user_id);
            CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING (auth.uid() = user_id);

            -- SETTINGS
            CREATE POLICY "Users can view own settings" ON settings FOR SELECT USING (auth.uid() = user_id);
            CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
            CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (auth.uid() = user_id);
            CREATE POLICY "Users can delete own settings" ON settings FOR DELETE USING (auth.uid() = user_id);
        `);

        console.log('✅ RLS Migration completed successfully!');

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await sql.end();
    }
}

runLegacyMigration();
