CREATE TABLE "receipt_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"expense_id" integer NOT NULL,
	"product_id" integer,
	"name_raw" text NOT NULL,
	"quantity" numeric DEFAULT '1',
	"unit" text,
	"unit_price" numeric,
	"total_price" numeric NOT NULL,
	"source" text DEFAULT 'rewe' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"alias_normalized" text NOT NULL,
	"product_id" integer NOT NULL,
	CONSTRAINT "product_aliases_user_alias_unique" UNIQUE("user_id","alias_normalized")
);
--> statement-breakpoint
CREATE INDEX "receipt_items_user_expense_idx" ON "receipt_items" ("user_id","expense_id");
--> statement-breakpoint
-- Row Level Security: jede/r sieht nur die eigenen Zeilen.
-- Der Sync-Job nutzt die Service-Role (supabaseAdmin) und umgeht RLS ohnehin.
ALTER TABLE "receipt_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "receipt_items_owner" ON "receipt_items" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "products_owner" ON "products" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "product_aliases_owner" ON "product_aliases" FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
-- Tabellen-Rechte für die Supabase-API-Rollen (RLS regelt danach den Zeilen-Zugriff).
-- Nötig, weil bei Anlage über die Direktverbindung die Default-GRANTs nicht greifen (Lektion aus 0002).
GRANT ALL ON TABLE "receipt_items" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT ALL ON TABLE "products" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT ALL ON TABLE "product_aliases" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "receipt_items_id_seq" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "products_id_seq" TO anon, authenticated, service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "product_aliases_id_seq" TO anon, authenticated, service_role;
