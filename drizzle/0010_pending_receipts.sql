-- Offene Bons des Kassenbon-Scans (nur für freigeschaltete Konten, app_metadata.receipt_scan).
-- Ein Bon lebt hier von der Aufnahme bis zum Speichern oder Verwerfen; danach wird die Zeile
-- samt Bild gelöscht. Die Bilder liegen im privaten Storage-Bucket "receipt-scans" unter
-- <user_id>/<bon_id>/<n>.<ext>.
CREATE TABLE IF NOT EXISTS "pending_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"status" text DEFAULT 'reading' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"image_paths" text[] DEFAULT '{}' NOT NULL,
	"result" jsonb,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"message" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_receipts_user_id_idx" ON "pending_receipts" ("user_id");
--> statement-breakpoint
-- RLS: Lesen, Ändern (Korrekturen) und Löschen nur eigene Zeilen. Anlegen und Auswerten
-- laufen ausschließlich über die Server Actions (Service-Role, nach Prüfung des Merkers),
-- deshalb gibt es bewusst keine INSERT-Policy.
ALTER TABLE "pending_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "pending_receipts_select_own" ON "pending_receipts";
--> statement-breakpoint
CREATE POLICY "pending_receipts_select_own" ON "pending_receipts" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "pending_receipts_update_own" ON "pending_receipts";
--> statement-breakpoint
CREATE POLICY "pending_receipts_update_own" ON "pending_receipts" FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "pending_receipts_delete_own" ON "pending_receipts";
--> statement-breakpoint
CREATE POLICY "pending_receipts_delete_own" ON "pending_receipts" FOR DELETE TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
-- Tabellen-Rechte (bei Anlage über die Direktverbindung greifen die Default-GRANTs nicht).
-- UPDATE nur auf die Spalten, die der Browser wirklich ändert (Korrekturen, "Ignorieren").
-- image_paths, status, result usw. schreibt ausschließlich die Service-Role — sonst könnte
-- jemand einen fremden Bildpfad eintragen und von der Auswertung lesen lassen.
REVOKE ALL ON TABLE "pending_receipts" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, DELETE ON TABLE "pending_receipts" TO authenticated;
--> statement-breakpoint
GRANT UPDATE ("edits", "skipped_at") ON TABLE "pending_receipts" TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE "pending_receipts" TO service_role;
--> statement-breakpoint
-- Privater Bucket für die Bonbilder. Keine Storage-Policies: nur die Service-Role kommt
-- heran, also nur die Server Actions nach Prüfung von Login und Merker.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipt-scans', 'receipt-scans', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
