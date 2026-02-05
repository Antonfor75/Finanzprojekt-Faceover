
import { db, client } from '../src/db/index';
import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';

async function resetAndMigrate() {
    console.log("⚠️  WARNING: This will wipe the database! ⚠️");

    try {
        // 1. Reset Database
        console.log("Dropping public schema...");
        await client`DROP SCHEMA public CASCADE`;
        console.log("Recreating public schema...");
        await client`CREATE SCHEMA public`;
        console.log("Restoring default grants...");
        await client`GRANT ALL ON SCHEMA public TO postgres`;
        await client`GRANT ALL ON SCHEMA public TO public`;

        // 2. Read Migration File
        const migrationPath = path.join(process.cwd(), 'drizzle', '0000_natural_gravity.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

        console.log(`Applying migration from ${migrationPath}...`);

        // 3. Execute Migration
        // We split by ';' to handle multiple statements if postgres driver needs it, 
        // but usually client.multi or just passing the whole string might work 
        // depending on the driver. Postgres.js 'simple' query or file helps.

        // Using simple() for multi-statement execution if available or just raw execution
        await client.unsafe(migrationSql);

        console.log("✓ Migration applied successfully.");

    } catch (error) {
        console.error("❌ Migration Failed:");
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
        process.exit(0);
    }
}

resetAndMigrate();
