import { integer, pgTable, serial, text, numeric, timestamp, boolean, uuid, unique, index } from 'drizzle-orm/pg-core';
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
    type: text('type'), // 'distribution' | 'savings' | 'fun'
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

export const accountTransactionsTable = pgTable('account_transactions', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    account_id: integer('account_id').notNull(),
    amount: numeric('amount').notNull(), // positive = deposit
    type: text('type').notNull(), // 'manual_deposit' | 'auto_deposit'
    note: text('note'),
    transaction_date: timestamp('transaction_date', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

export const budgetLogsTable = pgTable('budget_logs', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    amount: numeric('amount').notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
});

// Verbundene E-Mail-Postfächer für den automatischen REWE-Import (ein Postfach pro User).
// Das Secret (App-Passwort bzw. später OAuth-Refresh-Token) wird AES-256-GCM-verschlüsselt gespeichert.
export const emailConnectionsTable = pgTable('email_connections', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull().unique(),
    provider: text('provider').notNull().default('imap'), // 'imap' jetzt, 'oauth' später
    email_address: text('email_address').notNull(),
    secret_encrypted: text('secret_encrypted').notNull(), // verschlüsseltes App-Passwort / Refresh-Token
    status: text('status').notNull().default('connected'), // 'connected' | 'error'
    last_sync_at: timestamp('last_sync_at', { withTimezone: true }),
    last_error: text('last_error'),
    // Startdatum für den Import: NULL = alle Bons, sonst nur Bons ab diesem Datum.
    import_since: timestamp('import_since', { withTimezone: true }),
});

// Dedup + Audit für importierte REWE-eBon-Mails. message_id (RFC822) ist der Idempotenz-Schlüssel.
export const reweReceiptsTable = pgTable('rewe_receipts', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
    message_id: text('message_id').notNull().unique(), // Idempotenz-Schlüssel gegen Doppel-Import
    receipt_date: text('receipt_date'), // ISO-String des Bon-Datums
    total_amount: numeric('total_amount'),
    expense_id: integer('expense_id'), // Verweis auf die erzeugte Ausgabe
    raw_subject: text('raw_subject'),
    imported_at: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
});

// Artikelzeilen zu einer Ausgabe — optionale Zusatzinfo (aus Bon-Import oder später manuell).
// Hängt bewusst an expense_id (nicht an rewe_receipts), damit manuelle Artikel und
// künftige Stores dieselbe Struktur nutzen. Keine FK-Constraints (Projekt-Konvention).
export const receiptItemsTable = pgTable('receipt_items', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
    expense_id: integer('expense_id').notNull(),
    product_id: integer('product_id'), // Verweis auf kanonisches Produkt, nullable
    name_raw: text('name_raw').notNull(), // Originaltext vom Bon ("JA! TOMATENSOSSE")
    quantity: numeric('quantity').default('1'),
    unit: text('unit'), // 'stk' | 'kg' | null
    unit_price: numeric('unit_price'),
    total_price: numeric('total_price').notNull(), // negativ erlaubt (Pfand-Rückgabe/Rabatt)
    source: text('source').notNull().default('rewe'), // 'rewe' | 'manual' | später 'lidl' …
}, (t) => [
    index('receipt_items_user_expense_idx').on(t.user_id, t.expense_id),
]);

// Kanonische, store-übergreifende Produkte — der Aggregations-Anker für die Analyse
// ("100× Tomatensoße"), egal ob der Artikel von REWE, Lidl oder manuell kam.
export const productsTable = pgTable('products', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
    name: text('name').notNull(), // z. B. "Tomatensoße"
    category: text('category'), // vorbereitet für spätere Kategorisierung, bleibt vorerst leer
});

// Lerntabelle des Matchings: normalisierter Bon-Text → Produkt. Jede neue Schreibweise,
// die (fuzzy) zugeordnet wurde, landet hier und matcht künftig exakt.
export const productAliasesTable = pgTable('product_aliases', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
    alias_normalized: text('alias_normalized').notNull(),
    product_id: integer('product_id').notNull(),
}, (t) => [
    unique('product_aliases_user_alias_unique').on(t.user_id, t.alias_normalized),
]);

// Spaßkonto v2: ein Konto pro User, mit optionalen Gruppen (Events/Zeiträume) statt
// fester Kontenliste. Getrennt von accountsTable (type='fun'), da Struktur/Zeitmodell
// abweicht — bewusst isoliert von der Budget-/Girokonto-Berechnung.
export const funAccountsV2Table = pgTable('fun_accounts_v2', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    name: text('name').notNull().default('Spaßkonto'),
    foresight_enabled: boolean('foresight_enabled').notNull().default(true),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull().unique(), // ein Konto pro User
});

// Optionale Gruppierung (z. B. "Urlaub") mit Zeitraum. end_date null = Ein-Tages-Ereignis
// (= start_date). Ausgaben/Einnahmen können, müssen aber nicht einer Gruppe zugeordnet sein.
export const funGroupsTable = pgTable('fun_groups', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    fun_account_id: integer('fun_account_id').notNull(),
    name: text('name').notNull(),
    start_date: text('start_date').notNull(), // "Von"
    end_date: text('end_date'), // "Bis", optional
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [
    index('fun_groups_user_account_idx').on(t.user_id, t.fun_account_id),
]);

export const funGroupExpensesTable = pgTable('fun_group_expenses', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    fun_account_id: integer('fun_account_id').notNull(),
    group_id: integer('group_id'), // optional
    amount: numeric('amount').notNull(),
    description: text('description'),
    expense_date: text('expense_date').notNull(), // darf in der Zukunft liegen (geplante Ausgabe)
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [
    index('fun_group_expenses_user_account_idx').on(t.user_id, t.fun_account_id),
]);

export const funIncomeEntriesTable = pgTable('fun_income_entries', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    fun_account_id: integer('fun_account_id').notNull(),
    group_id: integer('group_id'), // optional
    amount: numeric('amount').notNull(),
    description: text('description'),
    income_date: text('income_date').notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [
    index('fun_income_entries_user_account_idx').on(t.user_id, t.fun_account_id),
]);

// public.users table removed. Using auth.users instead.
