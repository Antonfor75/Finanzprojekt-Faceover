
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local manually for the script context
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase keys in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_EMAIL = 'finance-app-e2e-test@proton.me';
const TEST_PASSWORD = 'SecurePassword123!';

async function setupUser() {
    console.log(`🤖 Attempting to setup test user: ${TEST_EMAIL}`);

    // 1. Try Login first (maybe it exists)
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
    });

    if (loginData.session) {
        console.log('✅ User already exists and login successful.');
        saveCredentials();
        return;
    }

    // 2. If login failed, try SignUp
    console.log('User not found or password changed. Attempting SignUp...');

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
    });

    if (signUpError) {
        console.error('❌ SignUp Failed:', signUpError.message);
        return;
    }

    if (signUpData.session) {
        console.log('✅ User created and auto-logged in (Email confirmation likely OFF).');
        saveCredentials();
    } else if (signUpData.user) {
        console.log('⚠️  User created but NO SESSION returned.');
        console.log('👉 This usually means "Email Confirmations" are ENABLED in Supabase.');
        console.log('👉 Please manually confirm the user in the Supabase Dashboard > Authentication > Users.');
        // We still save credentials because once confirmed, they will be valid.
        saveCredentials();
    }
}

function saveCredentials() {
    // Append to .env if not present
    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (!envContent.includes('TEST_EMAIL=')) {
        console.log('💾 Saving credentials to .env...');
        fs.appendFileSync(envPath, `\nTEST_EMAIL="${TEST_EMAIL}"\nTEST_PASSWORD="${TEST_PASSWORD}"\n`);
    } else {
        console.log('ℹ️  TEST_EMAIL already in .env');
    }
}

setupUser();
