import { integer, pgTable, serial, text, numeric, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const expensesTable = pgTable('expenses', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description'),
    amount: numeric('amount').notNull(),
    expense_date: text('expense_date'), // Stored as string/ISO in actions.ts
    category: text('category'),
    account_id: integer('account_id'), // Optional link to an account
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

export const fixedCostsTable = pgTable('fixed_costs', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    title: text('title').notNull(),
    amount: numeric('amount').notNull(),
    account_id: integer('account_id'), // Optional link to an account (legacy?)
    linked_account_id: integer('linked_account_id'), // Link to savings account for auto-generated costs
    valid_from: timestamp('valid_from', { withTimezone: true }),
    valid_to: timestamp('valid_to', { withTimezone: true }),
    execution_day: integer('execution_day'),
    frequency: text('frequency'),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

export const settingsTable = pgTable('settings', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    monthly_budget: numeric('monthly_budget').default('0'),
    savings_balance: numeric('savings_balance').default('0'),
    savings_months_remaining: integer('savings_months_remaining').default(0),
    last_processed_month: text('last_processed_month'),
    last_processed_week: text('last_processed_week'),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

export const accountsTable = pgTable('accounts', {
    id: serial('id').primaryKey(), // Using serial as it seems to be bigint/int
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    name: text('name').notNull(),
    amount: numeric('amount').notNull(),
    start_amount: numeric('start_amount'),
    target_amount: numeric('target_amount'),
    target_date: timestamp('target_date', { withTimezone: true }),
    months: integer('months').notNull(),
    type: text('type'), // 'distribution' | 'savings'
    processed_month: text('processed_month'),
    valid_from: timestamp('valid_from', { withTimezone: true }),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

export const incomeSourcesTable = pgTable('income_sources', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    title: text('title').notNull(),
    amount: numeric('amount').notNull(),
    valid_from: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    valid_to: timestamp('valid_to', { withTimezone: true }), // Nullable = Open End
    execution_day: integer('execution_day'),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

export const budgetLogsTable = pgTable('budget_logs', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    amount: numeric('amount').notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

// public.users table removed. Using auth.users instead.
