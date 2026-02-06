
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local manually
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');

// Helper to load env
function loadEnv(filePath: string) {
    if (fs.existsSync(filePath)) {
        const envConfig = dotenv.parse(fs.readFileSync(filePath));
        for (const k in envConfig) {
            process.env[k] = envConfig[k];
        }
    }
}

loadEnv(envLocalPath);
loadEnv(envPath); // Load .env to get TEST_EMAIL/PASSWORD

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase keys');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

console.log(`Testing Login for: "${TEST_EMAIL}" with password "${TEST_PASSWORD}"`);

async function verify() {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL!,
        password: TEST_PASSWORD!
    });

    if (error) {
        console.error('❌ Login Failed:', error.message);
        console.log('Details:', error);
    } else {
        console.log('✅ Login Successful!');
        console.log('User ID:', data.user.id);
    }
}

verify();
