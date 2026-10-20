import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Nur für die Messung der Bon-Auswertung (npm run eval:receipts) — echte Gemini-Aufrufe,
// deshalb getrennt von den normalen Tests (die *.eval.ts-Dateien laufen dort nie mit).
export default defineConfig({
    resolve: { alias: { '@': path.resolve(__dirname) } },
    test: {
        include: ['scripts/receipt-eval/**/*.eval.ts'],
        testTimeout: 30 * 60_000,
    },
});
