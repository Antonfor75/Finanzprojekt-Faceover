
import { client } from '../src/db/index';

async function resetDatabase() {
    console.log("⚠️  RESETTING DATABASE ⚠️");

    try {
        // 1. Clear Tables
        console.log("Cleaning tables...");
        await client.unsafe(`TRUNCATE TABLE expenses RESTART IDENTITY CASCADE;`);
        await client.unsafe(`TRUNCATE TABLE fixed_costs RESTART IDENTITY CASCADE;`);
        await client.unsafe(`TRUNCATE TABLE accounts RESTART IDENTITY CASCADE;`);
        await client.unsafe(`TRUNCATE TABLE settings RESTART IDENTITY CASCADE;`);

        // 2. Insert Default Settings (Budget = 11)
        console.log("Inserting default settings (Budget = 11)...");
        await client.unsafe(`
      INSERT INTO settings (monthly_budget, savings_balance, savings_months_remaining, last_processed_month)
      VALUES (0, 0, 0, NULL);
    `);

        console.log("✓ Database reset complete. Budget set to 11.");

    } catch (error) {
        console.error("❌ Reset Failed:");
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
        process.exit(0);
    }
}

resetDatabase();
