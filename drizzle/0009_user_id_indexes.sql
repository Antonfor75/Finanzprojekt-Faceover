-- Indizes auf user_id: Jede Abfrage der App filtert (per RLS) nach user_id. Ohne Index
-- liest Postgres dafür die ganze Tabelle — bei wenigen Nutzern egal, mit wachsenden
-- Datenmengen spürbar. Rein additiv: keine Daten- oder Rechteänderung, keine neuen GRANTs.
-- Tabellen, die schon einen Index mit führendem user_id haben (receipt_items, fun_*,
-- product_aliases, email_connections, deleted_rows), sind hier bewusst nicht dabei.
CREATE INDEX IF NOT EXISTS "expenses_user_id_idx" ON "expenses" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixed_costs_user_id_idx" ON "fixed_costs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settings_user_id_idx" ON "settings" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "income_sources_user_id_idx" ON "income_sources" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_user_id_idx" ON "products" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rewe_receipts_user_id_idx" ON "rewe_receipts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_transactions_user_id_idx" ON "account_transactions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_logs_user_id_idx" ON "budget_logs" ("user_id");
