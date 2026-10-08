import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    // Gleicher Alias wie in tsconfig.json ("@/*" -> Repo-Root), damit auch Server-Actions testbar sind.
    resolve: { alias: { '@': path.resolve(__dirname) } },
    test: {
        exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.git/**', 'e2e/**/*'],
    },
});
