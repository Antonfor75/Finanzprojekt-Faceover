
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
    console.log("Testing Supabase Client Update...");

    // 1. Get Settings
    const { data: settings, error: fetchError } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single();

    if (fetchError) {
        console.error("Fetch Error:", fetchError);
        return;
    }

    console.log("Current Settings:", settings);

    if (!settings) {
        console.log("No settings found to update.");
        return;
    }

    // 2. Update Budget to 1234.56
    console.log("Updating budget to 1234.56...");
    const { error: updateError, data: updatedData } = await supabase
        .from('settings')
        .update({ monthly_budget: 1234.56 })
        .eq('id', settings.id)
        .select();

    if (updateError) {
        console.error("Update Error:", updateError);
    } else {
        console.log("Update Success! New Data:", updatedData);
    }
}

testUpdate();
