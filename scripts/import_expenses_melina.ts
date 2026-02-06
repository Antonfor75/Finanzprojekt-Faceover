import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

const fs = require('fs');

// Try loading .env and .env.local
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
    console.error('Missing Supabase Environment Variables. Available keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const USER_EMAIL = 'melina@test.de';
const USER_PASSWORD = '123';

const EXPENSES: { date: string; amount: number; category: string; description?: string }[] = [
    { date: '2026-01-20', amount: 9, category: 'Essen' },
    { date: '2026-01-21', amount: 10, category: 'Essen' },
    { date: '2026-01-26', amount: 1.30, category: 'Essen' },
    { date: '2026-01-26', amount: 1.55, category: 'Essen' },
    { date: '2026-01-26', amount: 10, category: 'Essen' },
    { date: '2026-01-27', amount: 2.80, category: 'Essen' },
    { date: '2026-01-29', amount: 1, category: 'Essen' },
    { date: '2026-01-29', amount: 5, category: 'Essen' },
    { date: '2026-01-30', amount: 5, category: 'Essen' },
    { date: '2026-01-31', amount: 4, category: 'Essen' },
    { date: '2026-02-02', amount: 2, category: 'Essen' },
    { date: '2026-02-04', amount: 8, category: 'Essen' },
    { date: '2026-02-05', amount: 1, category: 'Essen' },
    { date: '2026-02-05', amount: 27, category: 'Essen' },
];

async function importExpenses() {
    console.log(`Logging in as ${USER_EMAIL}...`);

    // 1. Authenticate
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: USER_EMAIL,
        password: USER_PASSWORD,
    });

    if (authError || !authData.user) {
        console.error('Login failed:', authError?.message);
        return;
    }

    const userId = authData.user.id;
    console.log(`Login success. User ID: ${userId}`);

    // 2. Insert Expenses
    console.log(`Importing ${EXPENSES.length} expenses...`);

    const expensesToInsert = EXPENSES.map(e => ({
        amount: e.amount,
        category: e.category,
        description: e.description, // Optional but good to have
        expense_date: new Date(e.date).toISOString(), // Standardizing to ISO
        user_id: userId
    }));

    const { data: insertData, error: insertError } = await supabase
        .from('expenses')
        .insert(expensesToInsert)
        .select();

    if (insertError) {
        console.error('Import failed:', insertError);
    } else {
        console.log('✅ Import successful!');
        console.log(insertData);
    }
}

importExpenses();
