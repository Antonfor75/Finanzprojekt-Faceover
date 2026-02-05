
import { client } from '../src/db/index';

async function allowPublicAccess() {
    console.log("Relaxing RLS policies to allow public/anon access...");

    const tables = ['expenses', 'fixed_costs', 'settings', 'accounts'];

    try {
        for (const table of tables) {
            console.log(`Updating policy for table: ${table}`);

            const policyName = `policy_allow_anon_${table}`;

            // DROP existing authenticated policy if we want to replace or just add another?
            // Let's ADD a policy for anon, keeping the auth one just in case.

            await client.unsafe(`DROP POLICY IF EXISTS "${policyName}" ON "${table}";`);

            await client.unsafe(`
        CREATE POLICY "${policyName}"
        ON "${table}"
        FOR ALL
        TO anon
        USING (true)
        WITH CHECK (true);
      `);
        }

        console.log("✓ Public RLS Policies applied successfully.");

    } catch (error) {
        console.error("❌ RLS Update Failed:");
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
        process.exit(0);
    }
}

allowPublicAccess();
