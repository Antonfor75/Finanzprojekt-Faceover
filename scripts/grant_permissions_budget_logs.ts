import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function grantPermissions() {
    try {
        console.log('Granting permissions on budget_logs...');

        await sql.unsafe(`
            -- Grant access to the table
            GRANT ALL ON TABLE budget_logs TO authenticated;
            GRANT ALL ON TABLE budget_logs TO service_role;
            GRANT ALL ON TABLE budget_logs TO postgres;
            GRANT ALL ON TABLE budget_logs TO anon;

            -- Grant access to the sequence (id serial)
            GRANT ALL ON SEQUENCE budget_logs_id_seq TO authenticated;
            GRANT ALL ON SEQUENCE budget_logs_id_seq TO service_role;
            GRANT ALL ON SEQUENCE budget_logs_id_seq TO postgres;
            GRANT ALL ON SEQUENCE budget_logs_id_seq TO anon;
        `);

        console.log('✅ Permissions granted for budget_logs!');

    } catch (e) {
        console.error('Grant failed:', e);
    } finally {
        await sql.end();
    }
}
grantPermissions();
