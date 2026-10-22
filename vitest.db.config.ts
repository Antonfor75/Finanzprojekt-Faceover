import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Datenbank-Tests (npm run test:db): laufen gegen die echte Supabase-DB, aber jeder Test
// steckt in einer Transaktion, die immer zurückgerollt wird (siehe tests/db/dbTest.ts).
// Ohne IPv6: POOLER_HOST=aws-1-eu-west-1.pooler.supabase.com setzen.
export default defineConfig({
    resolve: { alias: { '@': path.resolve(__dirname) } },
    test: {
        include: ['tests/db/**/*.db.test.ts'],
        testTimeout: 30000,
        fileParallelism: false,
    },
});
