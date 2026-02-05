
import { db } from '../src/db/index';
import { expensesTable, settingsTable } from '../src/db/schema';
import { sql } from 'drizzle-orm';

async function verify() {
    console.log("Verifying Drizzle Connection and Schema...");
    try {
        // 1. Try to query settings
        console.log("Querying settings...");
        const settings = await db.select().from(settingsTable).limit(1);
        console.log("✓ Settings queried successfully:", settings);

        // 2. Try to query expenses
        console.log("Querying expenses...");
        const expenses = await db.select().from(expensesTable).limit(3);
        console.log(`✓ Expenses queried successfully (found ${expenses.length}).`);

        // 3. Insert verify (optional, to verify write permissions)
        // Removed for now to keep it read-only safe, but read is enough for schema matching usually.

        console.log("\nSUCCESS: Database connection is active and schema matches basic queries.");
    } catch (error) {
        console.error("\nFAILED: Connection or Schema issue detected.");
        // @ts-ignore
        if (error.code) {
            // @ts-ignore
            console.error(`Error Code: ${error.code}`);
            // @ts-ignore
            console.error(`Message: ${error.message}`);
            // @ts-ignore
            console.error(`Column: ${error.column_name || 'N/A'}`);
            // @ts-ignore
            console.error(`Table: ${error.table_name || 'N/A'}`);
        } else {
            console.error(error);
        }
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

verify();
