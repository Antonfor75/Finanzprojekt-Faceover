import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoMode, getRegisteredDemoClient } from '@/lib/data/mode'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type Client = SupabaseClient

// Der echte Client wird erst beim ersten Live-Zugriff erzeugt — in der Demo
// entsteht er nie, es gibt also auch keinen einzigen Aufruf an Supabase.
let realClient: Client | null = null
function getRealClient(): Client {
    if (!realClient) realClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
    return realClient
}

/**
 * Weiche vor allen Datenzugriffen: im Demo-Modus geht jeder Aufruf an den
 * localStorage-Client (lib/demo/demoClient.ts), sonst an Supabase.
 */
export const supabase = new Proxy({} as Client, {
    get(_target, prop) {
        const client = (isDemoMode() ? getRegisteredDemoClient() : getRealClient()) as unknown as Record<PropertyKey, unknown>
        const value = client[prop]
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value
    },
})
