import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Using anon key to test RLS roughly, but service role is needed generally for admin check.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // We need this to verify data exists at all ignoring RLS first.

if (!supabaseUrl || !serviceRoleKey) { console.error('Missing env vars'); process.exit(1); }

async function checkData() {
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    console.log('--- ADMIN CHECK (ALL LOGS) ---');
    const { data: allLogs, error: logsError } = await adminClient
        .from('budget_logs')
        .select('*')
        .order('created_at', { ascending: false });

    if (logsError) console.error('Admin Error:', logsError);
    else {
        console.log(`Found ${allLogs?.length} logs total.`);
        if (allLogs?.length > 0) console.log('Latest 3:', allLogs.slice(0, 3));
    }

    // Check specific user if we knew the ID... 
    // We can rely on the user reporting it works "saving" which implies network success.
}

checkData();
