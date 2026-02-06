
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function diagnose() {
    let output = '🔍 Diagnosing RLS Status...\n\n';

    try {
        const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];

        for (const table of tables) {
            // Check if RLS is enabled
            const result = await client`
                SELECT tablename, rowsecurity 
                FROM pg_tables 
                WHERE tablename = ${table}
            `;
            const status = result[0];

            output += `Table: ${table}\n`;
            if (status) {
                output += `  - RLS Enabled: ${status.rowsecurity ? '✅ YES' : '❌ NO'}\n`;
            } else {
                output += `  - Table NOT FOUND in pg_tables\n`;
            }

            // Check Policies
            const policies = await client`
                SELECT policyname, cmd, qual, with_check 
                FROM pg_policies 
                WHERE tablename = ${table}
            `;

            if (policies.length === 0) {
                output += `  - Policies: ❌ NONE FOUND\n`;
            } else {
                output += `  - Policies:\n`;
                policies.forEach(p => {
                    output += `    • ${p.policyname} (${p.cmd})\n`;
                });
            }
            output += '\n';
        }

        fs.writeFileSync('diagnosis_output.txt', output);
        console.log('Diagnosis written to diagnosis_output.txt');

    } catch (err) {
        console.error('❌ Error diagnosing RLS:', err);
    } finally {
        await client.end(); // Close connection
    }

    process.exit(0);
}

diagnose();
