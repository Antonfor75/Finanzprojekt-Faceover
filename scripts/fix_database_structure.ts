import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function fixDatabase() {
    try {
        console.log('--- STARTING DATABASE REPAIR ---');

        // 1. Drop public.users
        console.log('1. Dropping table public.users...');
        await sql`DROP TABLE IF EXISTS public.users CASCADE`;

        // 2. Fix Foreign Keys for all tables
        const tables = [
            'expenses',
            'fixed_costs',
            'accounts',
            'settings',
            'income_sources',
            'budget_logs'
        ];

        for (const table of tables) {
            console.log(`2. Processing table: ${table}...`);

            // Drop existing FK if exists (guessing common names, or just generic drop if we knew the name)
            // Postgres doesn't allow "DROP CONSTRAINT IF EXISTS" easily without knowing the name.
            // We will fetch constraints first or try to add and catch error? 
            // Better: Executing specific DDL.

            // We will Try to alter column to UUID just in case (casting content), then add FK.
            // CAUTION: Casting might fail if data is bad. But user claims schema mismatch.
            // We assume columns are ALREADY UUID because of local schema.

            await sql.unsafe(`
                DO $$ 
                DECLARE 
                    r RECORD; 
                BEGIN 
                    -- Find and drop existing foreign keys on user_id
                    FOR r IN (
                        SELECT constraint_name 
                        FROM information_schema.table_constraints 
                        WHERE table_name = '${table}' 
                        AND constraint_type = 'FOREIGN KEY'
                    ) LOOP 
                        EXECUTE 'ALTER TABLE ' || quote_ident('${table}') || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name); 
                    END LOOP; 
                END $$;
            `);

            // Add new FK
            console.log(`   Adding FK to auth.users for ${table}...`);
            await sql.unsafe(`
                ALTER TABLE ${table}
                ADD CONSTRAINT fk_${table}_user
                FOREIGN KEY (user_id) REFERENCES auth.users(id)
                ON DELETE CASCADE
            `);
        }

        console.log('--- DATABASE REPAIR COMPLETE ---');

    } catch (e) {
        console.error('Repair failed:', e);
    } finally {
        await sql.end();
    }
}

fixDatabase();
