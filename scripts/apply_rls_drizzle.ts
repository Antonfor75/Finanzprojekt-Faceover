
import { db } from '../src/db/index';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    try {
        const sqlFilePath = path.join(process.cwd(), 'scripts', 'enable_rls.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('Applying RLS migration via Drizzle...');

        // Split by semicolon to execute individually
        // Remove comments? Simple parser:
        // We will just split by ';' and filter empty lines.
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        console.log(`Found ${statements.length} statements.`);

        for (const statement of statements) {
            try {
                if (statement.startsWith('--')) continue; // specific simple comment skip

                // console.log('Executing:', statement.substring(0, 50).replace(/\n/g, ' ') + '...');
                await db.execute(sql.raw(statement));
                console.log('✓ Success');
            } catch (err: any) {
                // Ignore "already exists" errors 
                // 42701: duplicate_column
                // 42710: duplicate_object (policy)
                // 42P06: duplicate_schema
                // 42P07: duplicate_table / relation
                if (err.code === '42701' || err.code === '42710' || err.code === '42P07') {
                    console.log('⚠ Already exists (Skipping)');
                } else if (err.message && (err.message.includes('already exists') || err.message.includes('already a relation'))) {
                    console.log('⚠ Already exists (Skipping)');
                } else {
                    console.error('❌ Failed:', err.message);
                    console.error('Code:', err.code);
                    // console.error('Statement:', statement);
                }
            }
        }

        console.log('✅ RLS Policies application process finished.');
    } catch (err: any) {
        console.error('❌ Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

runMigration();
