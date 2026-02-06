import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function reloadCache() {
    try {
        console.log('Forcing Schema Cache Reload...');
        // Adding a comment triggers a schema reload in PostgREST
        await sql`COMMENT ON TABLE budget_logs IS 'Budget History Logs'`;
        console.log('✅ Schema Cache Reload Triggered.');
    } catch (e) {
        console.error('Failed to reload cache:', e);
    } finally {
        await sql.end();
    }
}
reloadCache();
