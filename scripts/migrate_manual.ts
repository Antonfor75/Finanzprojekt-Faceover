
import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
}

const sql = postgres(connectionString);

async function main() {
    console.log('Starting manual migration...');

    try {
        // 1. Create income_sources if not exists
        await sql`
      CREATE TABLE IF NOT EXISTS "income_sources" (
        "id" serial PRIMARY KEY NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "title" text NOT NULL,
        "amount" numeric NOT NULL,
        "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
        "valid_to" timestamp with time zone,
        "user_id" uuid DEFAULT auth.uid() NOT NULL
      );
    `;
        console.log('Checked/Created income_sources table');

        // 2. Create budget_logs if not exists
        await sql`
      CREATE TABLE IF NOT EXISTS "budget_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "amount" numeric NOT NULL,
        "user_id" uuid DEFAULT auth.uid() NOT NULL
      );
    `;
        console.log('Checked/Created budget_logs table');


        // 3. Add columns to accounts
        await sql`ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "start_amount" numeric`;
        await sql`ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "target_amount" numeric`;
        await sql`ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "target_date" timestamp with time zone`;
        await sql`ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "user_id" uuid DEFAULT auth.uid() NOT NULL`; // Might fail if column exists without default or type mismatch, but IF NOT EXISTS handles existence.
        console.log('Updated accounts table');

        // 4. Add columns to fixed_costs
        await sql`ALTER TABLE "fixed_costs" ADD COLUMN IF NOT EXISTS "account_id" integer`;
        await sql`ALTER TABLE "fixed_costs" ADD COLUMN IF NOT EXISTS "linked_account_id" integer`;
        await sql`ALTER TABLE "fixed_costs" ADD COLUMN IF NOT EXISTS "valid_from" timestamp with time zone`;
        await sql`ALTER TABLE "fixed_costs" ADD COLUMN IF NOT EXISTS "valid_to" timestamp with time zone`;
        await sql`ALTER TABLE "fixed_costs" ADD COLUMN IF NOT EXISTS "user_id" uuid DEFAULT auth.uid() NOT NULL`;
        console.log('Updated fixed_costs table');

        // 5. Add columns to expenses
        await sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "account_id" integer`;
        await sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "user_id" uuid DEFAULT auth.uid() NOT NULL`;
        console.log('Updated expenses table');

        // 6. Add columns to settings
        await sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "last_processed_week" text`;
        await sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "user_id" uuid DEFAULT auth.uid() NOT NULL`;
        console.log('Updated settings table');

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

main();
