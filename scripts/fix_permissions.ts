
import { client } from '../src/db/index';

async function fixPermissions() {
    console.log("Fixing Permissions (Grants & RLS)...");

    const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];
    const roles = ['anon', 'authenticated', 'service_role'];

    try {
        // 1. GRANT USAGE/ALL on Schema public
        console.log("Granting Schema Usage...");
        await client.unsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
        await client.unsafe(`GRANT ALL ON SCHEMA public TO postgres;`);

        // 2. GRANT ALL on ALL TABLES (to ensure basic SQL permissions)
        console.log("Granting Table Permissions...");
        await client.unsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;`);

        // 3. GRANT ALL on ALL SEQUENCES (Crucial for inserts!)
        console.log("Granting Sequence Permissions...");
        await client.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);

        // 4. Update RLS Policies to be "TO public" (Everyone)
        for (const table of tables) {
            console.log(`Updating RLS policy for table: ${table}`);

            // Cleanup old policies to avoid confusion
            await client.unsafe(`DROP POLICY IF EXISTS "policy_all_${table}" ON "${table}";`);
            await client.unsafe(`DROP POLICY IF EXISTS "policy_allow_anon_${table}" ON "${table}";`);
            await client.unsafe(`DROP POLICY IF EXISTS "policy_public_all_${table}" ON "${table}";`); // Cleanup previous attempts if any

            // Enable RLS (idempotent-ish, or ensures it is on)
            await client.unsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);

            // Create Comprehensive Policy
            await client.unsafe(`
        CREATE POLICY "policy_public_all_${table}"
        ON "${table}"
        FOR ALL
        TO public
        USING (true)
        WITH CHECK (true);
      `);
        }

        console.log("✓ Permissions fixed. RLS is now OPEN for public (anon + authenticated).");

    } catch (error) {
        console.error("❌ Permission Fix Failed:");
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
        process.exit(0);
    }
}

fixPermissions();
