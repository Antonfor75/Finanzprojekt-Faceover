import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('No DB URL'); process.exit(1); }

const sql = postgres(connectionString);

async function executeSql() {
    const filePath = process.argv[2]
    if (!filePath) {
        console.error('Please provide a SQL file path')
        process.exit(1)
    }

    const fileContent = fs.readFileSync(path.resolve(filePath), 'utf8')
    console.log('Executing SQL from:', filePath)

    try {
        // Execute as unsafe, allowing multiple statements/definitions
        await sql.unsafe(fileContent)
        console.log('✅ SQL Executed successfully!')
    } catch (e) {
        console.error('❌ SQL Execution failed:', e)
    } finally {
        await sql.end()
    }
}

executeSql()
