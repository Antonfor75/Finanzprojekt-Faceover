-- Einladungscodes für mehrere Personen.
-- Rein additiv: neue Spalten, neue Tabelle, zwei Funktionen. Es wird nichts gelöscht.
-- Idempotent geschrieben, damit das Skript gefahrlos erneut laufen kann.

ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "max_uses" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "use_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_max_uses_range" CHECK ("max_uses" BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_use_count_nonneg" CHECK ("use_count" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Bisher eingelöste Codes zählen als einmal genutzt.
UPDATE "invite_codes" SET "use_count" = 1 WHERE "used_at" IS NOT NULL AND "use_count" = 0;
--> statement-breakpoint
-- Wer welchen Code eingelöst hat. Ersetzt das einzelne Feld used_by.
CREATE TABLE IF NOT EXISTS "invite_code_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_id" integer NOT NULL REFERENCES "invite_codes"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_code_redemptions_code_user_unique" UNIQUE("code_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_code_redemptions_code_idx" ON "invite_code_redemptions" ("code_id");
--> statement-breakpoint
-- Bestehende Einlösungen übernehmen (idempotent).
INSERT INTO "invite_code_redemptions" ("code_id", "user_id", "redeemed_at")
SELECT "id", "used_by", COALESCE("used_at", now()) FROM "invite_codes" WHERE "used_by" IS NOT NULL
ON CONFLICT ("code_id", "user_id") DO NOTHING;
--> statement-breakpoint
-- Wie invite_codes: RLS an, bewusst KEINE Policy — nur die service_role kommt ran.
ALTER TABLE "invite_code_redemptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT ALL ON TABLE "invite_code_redemptions" TO service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "invite_code_redemptions_id_seq" TO service_role;
--> statement-breakpoint
-- Beansprucht atomar einen Platz auf dem Code. Kontingent UND Ablauf werden in
-- EINEM UPDATE geprüft; parallele Anfragen warten auf die Zeilensperre und sehen
-- danach den neuen Zählerstand — mehr als max_uses Einlösungen sind unmöglich.
-- used_at wird gesetzt, sobald der Code ausgeschöpft ist; "used_at IS NULL" in der
-- Bedingung hält auch die Übergangszeit sicher, in der noch der alte Code
-- (der nur used_at setzt) in Produktion läuft.
CREATE OR REPLACE FUNCTION public.claim_invite_code(p_code text)
RETURNS TABLE(code_id integer, status text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id integer;
    v_row invite_codes%ROWTYPE;
BEGIN
    UPDATE invite_codes c
       SET use_count = c.use_count + 1,
           used_at = CASE WHEN c.use_count + 1 >= c.max_uses THEN now() ELSE c.used_at END
     WHERE c.code = p_code
       AND c.used_at IS NULL
       AND c.use_count < c.max_uses
       AND (c.expires_at IS NULL OR c.expires_at > now())
    RETURNING c.id INTO v_id;

    IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT v_id, 'ok'::text;
        RETURN;
    END IF;

    SELECT * INTO v_row FROM invite_codes WHERE invite_codes.code = p_code;
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::integer, 'invalid'::text;
    ELSIF v_row.used_at IS NOT NULL OR v_row.use_count >= v_row.max_uses THEN
        RETURN QUERY SELECT v_row.id, 'exhausted'::text;
    ELSE
        RETURN QUERY SELECT v_row.id, 'expired'::text;
    END IF;
END
$$;
--> statement-breakpoint
-- Gibt einen beanspruchten Platz wieder frei (Anlegen des Users ist gescheitert).
CREATE OR REPLACE FUNCTION public.release_invite_code(p_id integer)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE invite_codes
       SET use_count = GREATEST(use_count - 1, 0),
           used_at = NULL
     WHERE id = p_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_invite_code(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.release_invite_code(integer) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_invite_code(text) TO service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.release_invite_code(integer) TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
