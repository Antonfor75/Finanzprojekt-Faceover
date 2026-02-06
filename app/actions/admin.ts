'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'

export async function getUsers() {
    try {
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

export async function deleteUserData(userId: string) {
    try {
        // 1. Delete all related data
        // We use Promise.all to do it in parallel
        await Promise.all([
            supabaseAdmin.from('expenses').delete().eq('user_id', userId),
            supabaseAdmin.from('fixed_costs').delete().eq('user_id', userId),
            supabaseAdmin.from('accounts').delete().eq('user_id', userId),
            supabaseAdmin.from('settings').delete().eq('user_id', userId),
            supabaseAdmin.from('income_sources').delete().eq('user_id', userId)
        ])

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
        // Delete all data but KEEP the user
        await Promise.all([
            supabaseAdmin.from('expenses').delete().eq('user_id', userId),
            supabaseAdmin.from('fixed_costs').delete().eq('user_id', userId),
            supabaseAdmin.from('accounts').delete().eq('user_id', userId),
            supabaseAdmin.from('settings').delete().eq('user_id', userId),
            supabaseAdmin.from('income_sources').delete().eq('user_id', userId)
        ])

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
