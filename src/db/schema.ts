import { integer, pgTable, serial, text, numeric, timestamp, boolean, uuid, unique, index, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const expensesTable = pgTable('expenses', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description'),
    amount: numeric('amount').notNull(),
    expense_date: text('expense_date'), // Stored as string/ISO in actions.ts
    category: text('category'),
    account_id: integer('account_id'), // Optional link to an account
    transfer_id: uuid('transfer_id'), // verbindet beide Seiten einer Umbuchung Girokonto <-> Spaßkonto (utils/transfer.ts)
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [index('expenses_user_id_idx').on(t.user_id)]); // drizzle/0009

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
}, (t) => [index('fixed_costs_user_id_idx').on(t.user_id)]); // drizzle/0009

export const settingsTable = pgTable('settings', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    monthly_budget: numeric('monthly_budget').default('0'),
    savings_balance: numeric('savings_balance').default('0'),
    savings_months_remaining: integer('savings_months_remaining').default(0),
    last_processed_month: text('last_processed_month'),
    last_processed_week: text('last_processed_week'),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [index('settings_user_id_idx').on(t.user_id)]); // drizzle/0009

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
}, (t) => [index('accounts_user_id_idx').on(t.user_id)]); // drizzle/0009

export const incomeSourcesTable = pgTable('income_sources', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    title: text('title').notNull(),
    amount: numeric('amount').notNull(),
    valid_from: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
    valid_to: timestamp('valid_to', { withTimezone: true }), // Nullable = Open End
    execution_day: integer('execution_day'),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [index('income_sources_user_id_idx').on(t.user_id)]); // drizzle/0009

export const accountTransactionsTable = pgTable('account_transactions', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    account_id: integer('account_id').notNull(),
    amount: numeric('amount').notNull(), // positive = deposit
    type: text('type').notNull(), // 'manual_deposit' | 'auto_deposit' | 'transfer_in' | 'transfer_out'
    note: text('note'),
    transaction_date: timestamp('transaction_date', { withTimezone: true }).defaultNow().notNull(),
    transfer_id: uuid('transfer_id'), // verbindet beide Seiten einer Umbuchung Girokonto <-> Spaßkonto (utils/transfer.ts)
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [index('account_transactions_user_id_idx').on(t.user_id)]); // drizzle/0009

export const budgetLogsTable = pgTable('budget_logs', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    amount: numeric('amount').notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [index('budget_logs_user_id_idx').on(t.user_id)]); // drizzle/0009

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
    raw_text: text('raw_text'), // zeilenweiser eBon-Text für die KI-Auswertung auf dem Handy
    imported_at: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('rewe_receipts_user_id_idx').on(t.user_id)]); // drizzle/0009

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
}, (t) => [index('products_user_id_idx').on(t.user_id)]); // drizzle/0009

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

// Offene Bons des Kassenbon-Scans (Gemini, nur mit app_metadata.receipt_scan) — von der
// Aufnahme bis zum Speichern/Verwerfen, danach wird die Zeile samt Bild gelöscht. Bilder im
// privaten Storage-Bucket "receipt-scans". Kein INSERT per RLS, nur über Server Actions. Migration 0010.
export const pendingReceiptsTable = pgTable('pending_receipts', {
    id: uuid('id').primaryKey().defaultRandom(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
    status: text('status').notNull().default('reading'), // 'reading' | 'ready' | 'failed'
    started_at: timestamp('started_at', { withTimezone: true }),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    skipped_at: timestamp('skipped_at', { withTimezone: true }),
    image_paths: text('image_paths').array().notNull().default(sql`'{}'`),
    result: jsonb('result'), // { store, date, total, category, items, ok, model }
    findings: jsonb('findings').notNull().default(sql`'[]'::jsonb`),
    edits: jsonb('edits').notNull().default(sql`'{}'::jsonb`), // von Hand geänderte Felder
    error: text('error'),
    message: text('message'),
}, (t) => [index('pending_receipts_user_id_idx').on(t.user_id)]);

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
    transfer_id: uuid('transfer_id'), // verbindet beide Seiten einer Umbuchung Girokonto <-> Spaßkonto (utils/transfer.ts)
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
    transfer_id: uuid('transfer_id'), // verbindet beide Seiten einer Umbuchung Girokonto <-> Spaßkonto (utils/transfer.ts)
    user_id: uuid('user_id').default(sql`auth.uid()`).notNull(),
}, (t) => [
    index('fun_income_entries_user_account_idx').on(t.user_id, t.fun_account_id),
]);

// Einladungscodes für die Selbstregistrierung: ohne gültigen, unbenutzten Code kann
// sich niemand einen Account anlegen. Bewusst OHNE RLS-Policy — die Tabelle wird
// ausschließlich serverseitig über supabaseAdmin (service_role) gelesen/geschrieben,
// da beim Registrieren noch keine Session existiert.
export const inviteCodesTable = pgTable('invite_codes', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    code: text('code').notNull().unique(),
    note: text('note'), // Freitext, z. B. für wen der Code gedacht ist
    expires_at: timestamp('expires_at', { withTimezone: true }), // null = läuft nie ab
    used_at: timestamp('used_at', { withTimezone: true }), // null = noch frei
    used_by: uuid('used_by'), // auth.users.id des eingelösten Accounts
    created_by: uuid('created_by'), // Admin, der den Code erzeugt hat
    max_uses: integer('max_uses').default(1).notNull(), // für wie viele Personen (1–100)
    use_count: integer('use_count').default(0).notNull(), // so oft schon eingelöst
});

// Wer welchen Einladungscode eingelöst hat (ein Code kann für mehrere Personen gelten).
// Wie invite_codes: RLS ohne Policy, nur service_role. Migration 0008.
export const inviteCodeRedemptionsTable = pgTable('invite_code_redemptions', {
    id: serial('id').primaryKey(),
    code_id: integer('code_id').notNull().references(() => inviteCodesTable.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(),
    redeemed_at: timestamp('redeemed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    unique('invite_code_redemptions_code_user_unique').on(t.code_id, t.user_id),
    index('invite_code_redemptions_code_idx').on(t.code_id),
]);

// public.users table removed. Using auth.users instead.
