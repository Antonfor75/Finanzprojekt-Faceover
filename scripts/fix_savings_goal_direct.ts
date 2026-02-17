
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log('Searching for "Neues Auto"...')

    const { data: costs, error: searchError } = await supabase
        .from('fixed_costs')
        .select('*')
        .ilike('title', '%Neues Auto%')

    if (searchError) {
        console.error('Search error:', searchError)
        process.exit(1)
    }

    if (!costs || costs.length === 0) {
        console.log('No matching cost found.')
        return
    }

    console.log('Found:', costs)

    for (const cost of costs) {
        console.log(`Updating cost ${cost.id} (${cost.title}) to 500...`)
        const { error: updateError } = await supabase
            .from('fixed_costs')
            .update({ amount: 500 })
            .eq('id', cost.id)

        if (updateError) {
            console.error('Update error:', updateError)
        } else {
            console.log('Update successful!')
        }
    }
}

main()
