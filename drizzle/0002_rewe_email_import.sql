CREATE TABLE "email_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"provider" text DEFAULT 'imap' NOT NULL,
	"email_address" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"import_since" timestamp with time zone,
	CONSTRAINT "email_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "rewe_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"message_id" text NOT NULL,
	"receipt_date" text,
	"total_amount" numeric,
	"expense_id" integer,
	"raw_subject" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rewe_receipts_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
-- Row Level Security: jede/r sieht nur die eigenen Zeilen (Secrets sind sensibel).
-- Der Sync-Job nutzt die Service-Role (supabaseAdmin) und umgeht RLS ohnehin.
ALTER TABLE "email_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rewe_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "email_connections_owner" ON "email_connections" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "rewe_receipts_owner" ON "rewe_receipts" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
-- Tabellen-Rechte für die Supabase-API-Rollen (RLS regelt danach den Zeilen-Zugriff).
-- Nötig, weil bei Anlage über die Direktverbindung die Default-GRANTs nicht griffen.
GRANT ALL ON TABLE "email_connections" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT ALL ON TABLE "rewe_receipts" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "email_connections_id_seq" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "rewe_receipts_id_seq" TO anon, authenticated, service_role;
