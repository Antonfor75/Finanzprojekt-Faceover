CREATE TABLE IF NOT EXISTS "invite_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"note" text,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"created_by" uuid,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
-- RLS an, aber bewusst KEINE Policy: damit kommt ausschließlich die service_role
-- (die RLS umgeht) an die Tabelle. Weder anon noch eingeloggte User können Codes
-- lesen, raten-prüfen oder anlegen — die Validierung läuft nur über Server Actions.
ALTER TABLE "invite_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- GRANTs für die API-Rollen: ohne die kommt PostgREST nicht an die Tabelle
-- ("permission denied for table"). Nur service_role bekommt Rechte — anon und
-- authenticated bewusst NICHT, damit die Codes gar nicht erst erreichbar sind.
GRANT ALL ON TABLE "invite_codes" TO service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "invite_codes_id_seq" TO service_role;
