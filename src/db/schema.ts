import { integer, pgTable, serial, text, numeric, timestamp, boolean } from 'drizzle-orm/pg-core';

export const expensesTable = pgTable('expenses', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description'),
    amount: numeric('amount').notNull(),
    expense_date: text('expense_date'), // Stored as string/ISO in actions.ts
    category: text('category'),
});

export const fixedCostsTable = pgTable('fixed_costs', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    title: text('title').notNull(),
    amount: numeric('amount').notNull(),
});

export const settingsTable = pgTable('settings', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    monthly_budget: numeric('monthly_budget').default('0'),
    savings_balance: numeric('savings_balance').default('0'),
    savings_months_remaining: integer('savings_months_remaining').default(0),
    last_processed_month: text('last_processed_month'),
});

export const accountsTable = pgTable('accounts', {
    id: serial('id').primaryKey(), // Using serial as it seems to be bigint/int
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    name: text('name').notNull(),
    amount: numeric('amount').notNull(),
    months: integer('months').notNull(),
    type: text('type'), // 'distribution' | 'savings'
    processed_month: text('processed_month'),
});

// Keeping the original users table for reference, though likely unused
export const usersTable = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
});
