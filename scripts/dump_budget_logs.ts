import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function checkLogs() {
    try {
        console.log('--- BUDGET LOGS DUMP ---');
        const logs = await sql`SELECT * FROM budget_logs ORDER BY created_at DESC LIMIT 5`;
        console.log(logs);

        if (logs.length === 0) {
            console.log('Use query returned NO rows. Table is empty.');
        } else {
            console.log(`Found ${logs.length} rows.`);
        }
    } catch (e) {
        console.error('Query failed:', e);
    } finally {
        await sql.end();
    }
}
checkLogs();
