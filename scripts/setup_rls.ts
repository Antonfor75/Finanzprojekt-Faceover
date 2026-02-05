
import { client } from '../src/db/index';

async function setupRLS() {
    console.log("Setting up Row Level Security (RLS)...");

    const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];

    try {
        for (const table of tables) {
            console.log(`Configuring table: ${table}`);

            // 1. Enable RLS
            await client.unsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);

            // 2. Create Policy (Allow all for authenticated users for now)
            // In a real multi-user app, this should be restricted by user_id, 
            // but the current schema suggests a single-user or shared setup (no user_id column in tables).
            // 'settings' is shared (id=1). 
            // The previous code didn't filter by user, so we will allow usage for authenticated users.

            const policyName = `policy_all_${table}`;

            // DROP existing if any (to be safe/clean)
            await client.unsafe(`DROP POLICY IF EXISTS "${policyName}" ON "${table}";`);

            // CREATE new policy
            await client.unsafe(`
        CREATE POLICY "${policyName}"
        ON "${table}"
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
      `);

            // Also allow for anon if users are not logged in? 
            // User has a LoginScreen, so they are likely authenticated.
            // But let's check if the previous setup allowed anon? 
            // Usually "authenticated" is the standard role.
        }

        console.log("✓ RLS Policies applied successfully.");

    } catch (error) {
        console.error("❌ RLS Setup Failed:");
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
        process.exit(0);
    }
}

setupRLS();
