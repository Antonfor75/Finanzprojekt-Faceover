import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load Env
const envFiles = ['.env', '.env.local'];
envFiles.forEach(file => {
    const p = path.resolve(process.cwd(), file);
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`Loaded ${file}`);
    }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const USER_EMAIL = 'melina@test.de';
const USER_PASSWORD = '123';

async function wipeData() {
    console.log(`Logging in as ${USER_EMAIL}...`);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: USER_EMAIL,
        password: USER_PASSWORD,
    });

    if (authError || !authData.user) {
        console.error('Login failed:', authError?.message);
        return;
    }

    const userId = authData.user.id;
    console.log(`Login success. Wiping data for User ID: ${userId}`);

    const tables = ['expenses', 'fixed_costs', 'accounts', 'income_sources', 'budget_logs', 'settings'];

    for (const table of tables) {
        console.log(`Deleting from ${table}...`);
        const { error } = await supabase.from(table).delete().eq('user_id', userId);
        if (error) console.error(`Failed to wipe ${table}:`, error.message);
        else console.log(`  Cleaned ${table}.`);
    }

    console.log('✅ All data wiped for Melina.');
}

wipeData();
