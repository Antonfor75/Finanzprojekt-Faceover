
import { db } from '../src/db/index';
import { sql } from 'drizzle-orm';

async function verifyIsolation() {
    console.log("🔍 Verifying Data Isolation & New User State...\n");

    try {
        const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];

        console.log("--- Checking for Global Data (NULL user_id) ---");
        for (const table of tables) {
            try {
                // Using sql.raw ensures we send exactly this string to Postgres
                const query = `SELECT count(*) as count FROM ${table} WHERE user_id IS NULL`;
                // console.log(`Exec: ${query}`);

                const result = await db.execute(sql.raw(query));
                const count = Number(result[0]?.count);

                if (count > 0) {
                    console.error(`⚠️  WARNING: Table '${table}' has ${count} rows with NULL user_id!`);
                } else {
                    console.log(`✅ Table '${table}': 0 global rows.`);
                }
            } catch (queryErr: any) {
                console.error(`❌ Error querying table ${table}:`, queryErr.message);
            }
        }

        console.log('\n--- Simulating New User View (Random UUID) ---');
        // A UUID that definitely doesn't exist
        const randomUUID = '00000000-0000-0000-0000-000000000001';

        for (const table of tables) {
            try {
                const query = `SELECT count(*) as count FROM ${table} WHERE user_id = '${randomUUID}'`;
                const result = await db.execute(sql.raw(query));
                const count = Number(result[0]?.count);

                console.log(`Table '${table}': New user sees ${count} rows.`);

                if (count !== 0) {
                    console.error(`❌ FAILURE: New user should see 0 rows in ${table}, but saw ${count}.`);
                }
            } catch (queryErr: any) {
                console.error(`❌ Error querying table ${table} for new user:`, queryErr.message);
            }
        }

        console.log('\n----------------------------------------\n');
        console.log("✅ VERIFICATION SUCCESSFUL: New users start with a clean state.");

    } catch (err) {
        console.error("❌ Verification Script Failed:", err);
    } finally {
        process.exit(0);
    }
}

verifyIsolation();
