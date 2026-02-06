import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('Error: DATABASE_URL or POSTGRES_URL not found in environment');
    process.exit(1);
}

const sql = postgres(connectionString);

async function runMigration() {
    try {
        const sqlFilePath = path.join(process.cwd(), 'scripts', 'enable_rls.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('Applying RLS migration from:', sqlFilePath);

        // Split by statements if needed, but postgres.js file() or simple query might handle it.
        // Simple query for multiple statements might rely on protocol.
        // Best to use sql.file or simple template literal if it allows multiple statements.
        // postgres.js 'file' helper is good, but we have content string.

        // Let's try simple execution. simple() protocol might be safer for multiple statements.
        // But postgres.js `sql` tag usually handles parameterized queries.
        // For raw script execution using simple protocol:

        await sql.unsafe(sqlContent);

        console.log('✅ RLS Policies applied successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await sql.end();
    }
}

runMigration();
