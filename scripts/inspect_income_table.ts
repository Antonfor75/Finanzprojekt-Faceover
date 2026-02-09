
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env from .env.local
const envPath = path.resolve(process.cwd(), '.env.local')
console.log('Loading env from:', envPath)
const result = dotenv.config({ path: envPath })

if (result.error) {
    console.error('Error loading .env.local:', result.error)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('Supabase URL:', supabaseUrl)
// console.log('Service Key:', supabaseServiceKey) // Don't log secrets

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function inspect() {
    console.log('Inspecting income_sources table...')

    // Try inserting a dummy row with valid_from to check if column exists
    // We use a random UUID for user_id to trigger a FK violation if the column exists,
    // or a "column does not exist" error if it doesn't.

    const dummyId = '00000000-0000-0000-0000-000000000000'

    try {
        const { error } = await supabase.from('income_sources').insert({
            title: 'Schema Check',
            amount: 0,
            user_id: dummyId,
            valid_from: new Date().toISOString()
        })

        if (error) {
            console.log('Insert Error:', error.message)
            console.log('Error Details:', JSON.stringify(error, null, 2))
        } else {
            console.log('Insert Success (Unexpected with dummy UUID)')
        }

    } catch (e) {
        console.error('Exception:', e)
    }
}

inspect()
