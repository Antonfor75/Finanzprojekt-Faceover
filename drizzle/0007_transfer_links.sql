-- Umbuchungen Girokonto <-> Spaßkonto: beide Seiten teilen sich eine transfer_id,
-- damit Ändern/Löschen immer beide Seiten mit demselben Betrag trifft (utils/transfer.ts).
-- Nur neue, nullable Spalten an bestehenden Tabellen: keine neuen GRANTs nötig.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "transfer_id" uuid;
--> statement-breakpoint
ALTER TABLE "account_transactions" ADD COLUMN IF NOT EXISTS "transfer_id" uuid;
--> statement-breakpoint
ALTER TABLE "fun_group_expenses" ADD COLUMN IF NOT EXISTS "transfer_id" uuid;
--> statement-breakpoint
ALTER TABLE "fun_income_entries" ADD COLUMN IF NOT EXISTS "transfer_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_transfer_id_idx" ON "expenses" ("transfer_id") WHERE "transfer_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_transactions_transfer_id_idx" ON "account_transactions" ("transfer_id") WHERE "transfer_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fun_group_expenses_transfer_id_idx" ON "fun_group_expenses" ("transfer_id") WHERE "transfer_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fun_income_entries_transfer_id_idx" ON "fun_income_entries" ("transfer_id") WHERE "transfer_id" IS NOT NULL;
--> statement-breakpoint
-- PostgREST soll die neuen Spalten sofort kennen.
NOTIFY pgrst, 'reload schema';
