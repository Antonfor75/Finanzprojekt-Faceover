'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { assertAdmin } from '@/utils/adminGuard'

export async function getUsers() {
    try {
        await assertAdmin()

        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers()

        if (error) {
            console.error('Error fetching users:', error)
            throw new Error(error.message)
        }

        return { success: true, users }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function createUser(email: string, password: string) {
    try {
        await assertAdmin()

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true // Auto-confirm the email
        })

        if (error) {
            console.error('Error creating user:', error)
            throw new Error(error.message)
        }

        return { success: true, user: data.user }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Alle user-bezogenen Tabellen, Kinder vor Eltern (Fremdschluessel).
// Muss identisch zu USER_TABLES in der Chefansicht-App bleiben
// (supabase/functions/chef-admin/index.ts) — Web und App loeschen dasselbe.
const USER_TABLES = [
    'receipt_items',
    'rewe_receipts',
    'product_aliases',
    'products',
    'fun_group_expenses',
    'fun_income_entries',
    'fun_groups',
    'fun_accounts_v2',
    'account_transactions',
    'budget_logs',
    'email_connections',
    'expenses',
    'fixed_costs',
    'accounts',
    'settings',
    'income_sources',
] as const

/** Loescht alle Daten eines Users, laesst den Account selbst stehen. */
async function wipeUserData(userId: string) {
    // Nacheinander, nicht parallel: die Reihenfolge Kinder-vor-Eltern haelt nur so.
    for (const table of USER_TABLES) {
        const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId)
        // Eine Tabelle, die es (noch) nicht gibt, darf den Reset nicht kippen.
        if (error && error.code !== '42P01') {
            throw new Error(`${table}: ${error.message}`)
        }
    }
}

export async function deleteUserData(userId: string) {
    try {
        await assertAdmin()

        // 1. Delete all related data
        await wipeUserData(userId)

        // 2. Delete the user from Auth
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (error) {
            console.error('Error deleting auth user:', error)
            throw new Error(error.message)
        }

        return { success: true }
    } catch (error: any) {
        console.error('Delete user failed:', error)
        return { success: false, error: error.message }
    }
}

export async function resetUserData(userId: string) {
    try {
        await assertAdmin()

        // Delete all data but KEEP the user
        await wipeUserData(userId)

        return { success: true }
    } catch (error: any) {
        console.error('Reset user failed:', error)
        return { success: false, error: error.message }
    }
}

import fs from 'fs/promises'
import path from 'path'

export async function getSchemaDiagram() {
    try {
        await assertAdmin()

        const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.ts')
        const content = await fs.readFile(schemaPath, 'utf-8')

        // Simple Regex parsing for Drizzle schema
        // This is a basic parser and might need adjustment if schema style changes significantly
        const tableRegex = /export const (\w+) = pgTable\('(\w+)', \{([\s\S]*?)\}\);/g

        let mermaidCode = 'erDiagram\n'
        let match;

        // Standard User definition (since it's auth.users and not in schema file usually)
        mermaidCode += `
    USERS ||--o{ EXPENSES : "has"
    USERS ||--o{ FIXED_COSTS : "has"
    USERS ||--o{ ACCOUNTS : "has"
    USERS ||--o{ SETTINGS : "has"
    USERS ||--o{ INCOME_SOURCES : "has"
    USERS ||--o{ BUDGET_LOGS : "logs"

    USERS {
        uuid id PK
        string email
    }
`

        while ((match = tableRegex.exec(content)) !== null) {
            const tableName = match[2].toUpperCase()
            const body = match[3]

            mermaidCode += `    ${tableName} {\n`

            const columnRegex = /(\w+): \w+\('(\w+)'/g
            let colMatch;
            while ((colMatch = columnRegex.exec(body)) !== null) {
                const colName = colMatch[2]
                // Simple type inference (could be improved)
                let type = 'string'
                if (colName.includes('id')) type = 'uuid/serial'
                if (colName.includes('amount')) type = 'numeric'
                if (colName.includes('date') || colName.includes('at')) type = 'timestamp'

                // Mark PK/FK
                let suffix = ''
                if (colName === 'id') suffix = ' PK'
                if (colName === 'user_id') suffix = ' FK'

                mermaidCode += `        ${type} ${colName}${suffix}\n`
            }
            mermaidCode += `    }\n`
        }

        return { success: true, diagram: mermaidCode }
    } catch (error: any) {
        console.error('Schema parsing failed:', error)
        return { success: false, error: error.message }
    }
}
