import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function applyOptimization() {
    try {
        console.log('Reading optimization script...');
        const scriptPath = path.join(process.cwd(), 'scripts', 'optimize_rls.sql');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        console.log('Applying optimized RLS policies...');
        await sql.unsafe(scriptContent);

        console.log('✅ RLS optimization applied successfully!');

    } catch (e) {
        console.error('Failed to apply optimization:', e);
    } finally {
        await sql.end();
    }
}

applyOptimization();
