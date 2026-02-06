
import { db } from '../src/db/index';
import { sql } from 'drizzle-orm';

async function debugSchema() {
    console.log("🔍 Debugging Schema...\n");

    try {
        const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];

        for (const table of tables) {
            // Check Columns
            const columns = await db.execute(sql.raw(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = '${table}';
            `));

            console.log(`\nTable '${table}' columns:`);
            const hasUserId = columns.some((c: any) => c.column_name === 'user_id');

            columns.forEach((c: any) => {
                console.log(` - ${c.column_name} (${c.data_type})`);
            });

            if (!hasUserId) {
                console.error(`❌ CRITICAL: 'user_id' column MISSING in table '${table}'`);
            } else {
                console.log(`✅ 'user_id' column present.`);
            }
        }

    } catch (err) {
        console.error("❌ Debug Failed:", err);
    } finally {
        process.exit(0);
    }
}

debugSchema();
