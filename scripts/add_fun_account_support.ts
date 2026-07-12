
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
    console.log('Adding fun account support (account_transactions table)...');

    try {
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS account_transactions (
                id serial PRIMARY KEY,
                created_at timestamptz DEFAULT now() NOT NULL,
                account_id integer NOT NULL,
                amount numeric NOT NULL,
                type text NOT NULL,
                note text,
                transaction_date timestamptz DEFAULT now() NOT NULL,
                user_id uuid DEFAULT auth.uid() NOT NULL
            );
        `);
        console.log('Table account_transactions ready.');

        await db.execute(sql`ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;`);

        await db.execute(sql`DROP POLICY IF EXISTS "Users can view own account_transactions" ON account_transactions;`);
        await db.execute(sql`CREATE POLICY "Users can view own account_transactions" ON account_transactions FOR SELECT USING (auth.uid() = user_id);`);

        await db.execute(sql`DROP POLICY IF EXISTS "Users can insert own account_transactions" ON account_transactions;`);
        await db.execute(sql`CREATE POLICY "Users can insert own account_transactions" ON account_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);`);

        await db.execute(sql`DROP POLICY IF EXISTS "Users can update own account_transactions" ON account_transactions;`);
        await db.execute(sql`CREATE POLICY "Users can update own account_transactions" ON account_transactions FOR UPDATE USING (auth.uid() = user_id);`);

        await db.execute(sql`DROP POLICY IF EXISTS "Users can delete own account_transactions" ON account_transactions;`);
        await db.execute(sql`CREATE POLICY "Users can delete own account_transactions" ON account_transactions FOR DELETE USING (auth.uid() = user_id);`);
        console.log('RLS policies applied.');

        await db.execute(sql`GRANT ALL ON account_transactions TO authenticated;`);
        await db.execute(sql`GRANT USAGE ON SEQUENCE account_transactions_id_seq TO authenticated;`);
        console.log('Grants applied.');

        await db.execute(sql`NOTIFY pgrst, 'reload schema';`);
        console.log('Schema cache reload requested. Done.');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main();
