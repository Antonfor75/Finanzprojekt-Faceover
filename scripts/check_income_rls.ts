// scripts/check_income_rls.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Checking Income Sources (Anon Check)...');
    // NOTE: This will likely fail or return empty if RLS is working and we are not logged in.
    // The goal is just to see if the table responds at all (not 404/Permission Denied).
    const { data, error } = await supabase.from('income_sources').select('*');
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Data access successful (might be empty list):', data);
    }
}
check();
