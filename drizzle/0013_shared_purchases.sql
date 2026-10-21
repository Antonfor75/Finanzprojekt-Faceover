-- Geteilte Einkäufe, Teil 2: Teilungen (shared_purchases), neue Spalten an expenses/receipt_items
-- und die RPC-Funktionen save_share / unshare / delete_shared / mark_shares_seen.
-- Setzt 0012 voraus (profiles, friendships, friend_lock, friend_state_for).
--
-- Geschrieben wird ausschließlich über die SECURITY-DEFINER-Funktionen weiter unten; die Tabelle hat
-- bewusst keine INSERT-/UPDATE-/DELETE-Rechte für authenticated. Gerechnet wird in Cent; der Partner-Anteil
-- wird gerundet, die eintragende Person (creator) bekommt den Rest (wie utils/sharing/split.ts).
-- Die Fremdschlüssel auf shared_purchases sind eine bewusste Ausnahme von der Konvention "keine FKs":
-- nur so werden Kopien beim Löschen eines Kontos oder beim Lösen der Freundschaft sicher abgelöst.
CREATE TABLE IF NOT EXISTS "shared_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"partner_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"creator_expense_id" integer NOT NULL,
	"partner_expense_id" integer NOT NULL,
	"description" text,
	"expense_date" text,
	"category" text,
	"total" numeric(12,2) NOT NULL,
	"mode" text NOT NULL,
	"partner_percent" numeric,
	"partner_amount" numeric(12,2) NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now(),
	"creator_seen_at" timestamp with time zone,
	"partner_seen_at" timestamp with time zone,
	CONSTRAINT "shared_purchases_mode_check" CHECK ("mode" IN ('percent', 'amount', 'items')),
	CONSTRAINT "shared_purchases_not_self" CHECK ("creator_id" <> "partner_id"),
	CONSTRAINT "shared_purchases_amounts_check" CHECK ("total" >= 0 AND "partner_amount" >= 0 AND "partner_amount" <= "total")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shared_purchases_creator_expense_unique" ON "shared_purchases" ("creator_expense_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shared_purchases_partner_expense_unique" ON "shared_purchases" ("partner_expense_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_purchases_creator_idx" ON "shared_purchases" ("creator_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_purchases_partner_idx" ON "shared_purchases" ("partner_id");
--> statement-breakpoint
ALTER TABLE "expenses"
	ADD COLUMN IF NOT EXISTS "shared_purchase_id" uuid REFERENCES "shared_purchases"("id") ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS "share_total" numeric(12,2),
	ADD COLUMN IF NOT EXISTS "share_mode" text,
	ADD COLUMN IF NOT EXISTS "share_note" text;
--> statement-breakpoint
ALTER TABLE "receipt_items"
	ADD COLUMN IF NOT EXISTS "shared_purchase_id" uuid REFERENCES "shared_purchases"("id") ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS "shared_away" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Für das Ablösen (ON DELETE SET NULL) und das Aufräumen der Teilung.
CREATE INDEX IF NOT EXISTS "expenses_shared_purchase_idx" ON "expenses" ("shared_purchase_id") WHERE "shared_purchase_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_items_shared_purchase_idx" ON "receipt_items" ("shared_purchase_id") WHERE "shared_purchase_id" IS NOT NULL;
--> statement-breakpoint
-- RLS: nur Lesen, und nur die eigenen Teilungen. Keine Schreib-Policies.
ALTER TABLE "shared_purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "shared_purchases_select_own" ON "shared_purchases";
--> statement-breakpoint
CREATE POLICY "shared_purchases_select_own" ON "shared_purchases" FOR SELECT TO authenticated USING (auth.uid() = creator_id OR auth.uid() = partner_id);
--> statement-breakpoint
-- Tabellen-Rechte (bei Anlage über die Direktverbindung greifen die Default-GRANTs nicht).
REVOKE ALL ON TABLE "shared_purchases" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE "shared_purchases" TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE "shared_purchases" TO service_role;
--> statement-breakpoint
-- Interne Hilfe (nicht für Clients): prüft die Artikelliste und gibt sie auf die ShareItem-Schlüssel reduziert zurück.
CREATE OR REPLACE FUNCTION public.share_normalize_items(p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
	el jsonb;
	v_out jsonb := '[]'::jsonb;
	v_keys text[] := ARRAY[]::text[];
	v_ok boolean;
BEGIN
	IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 1000 THEN
		RAISE EXCEPTION 'Ungültige Artikelliste.';
	END IF;
	FOR el IN SELECT value FROM jsonb_array_elements(p_items) LOOP
		v_ok := coalesce(jsonb_typeof(el) = 'object', false)
			AND coalesce(jsonb_typeof(el->'key') = 'string', false) AND coalesce(el->>'key', '') <> ''
			AND coalesce(jsonb_typeof(el->'name_raw') = 'string', false)
			AND coalesce(jsonb_typeof(el->'quantity') = 'number', false)
			AND coalesce(jsonb_typeof(el->'total_price') = 'number', false)
			AND coalesce(jsonb_typeof(el->'owner') = 'string', false) AND coalesce(el->>'owner', '') IN ('creator', 'partner')
			AND (el->'unit' IS NULL OR jsonb_typeof(el->'unit') = 'null' OR (jsonb_typeof(el->'unit') = 'string' AND el->>'unit' IN ('stk', 'kg')))
			AND (el->'unit_price' IS NULL OR jsonb_typeof(el->'unit_price') IN ('null', 'number'));
		IF NOT v_ok OR (el->>'key') = ANY(v_keys) THEN
			RAISE EXCEPTION 'Ungültige Artikelliste.';
		END IF;
		v_keys := v_keys || (el->>'key');
		v_out := v_out || jsonb_build_object(
			'key', el->>'key',
			'name_raw', el->>'name_raw',
			'quantity', el->'quantity',
			'unit', coalesce(el->'unit', 'null'::jsonb),
			'unit_price', coalesce(el->'unit_price', 'null'::jsonb),
			'total_price', el->'total_price',
			'owner', el->>'owner'
		);
	END LOOP;
	RETURN v_out;
END;
$$;
--> statement-breakpoint
-- Teilen anlegen oder ändern. Der Aufrufer muss Eigentümer von p_expense_id sein (creator oder partner der Teilung).
-- Gesperrt wird in fester Reihenfolge: erst beide Konten (Advisory-Lock, wie in 0012), dann die Zeile der Teilung.
CREATE OR REPLACE FUNCTION public.save_share(p_expense_id integer, p_mode text, p_partner_percent numeric, p_partner_amount numeric, p_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_exp expenses%ROWTYPE;
	v_sp shared_purchases%ROWTYPE;
	v_is_new boolean := false;
	v_friend uuid;
	v_id uuid;
	v_creator uuid;
	v_partner uuid;
	v_creator_exp integer;
	v_partner_exp integer;
	v_total_cents bigint;
	v_partner_cents numeric;
	v_items jsonb := '[]'::jsonb;
	v_creator_handle text;
	v_partner_handle text;
	v_now timestamptz := clock_timestamp();
	v_rows integer;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	IF p_mode IS NULL OR p_mode NOT IN ('percent', 'amount', 'items') THEN
		RAISE EXCEPTION 'Ungültiger Teilungsmodus.';
	END IF;
	IF (p_mode = 'percent' AND p_partner_percent IS NULL) OR (p_mode = 'amount' AND p_partner_amount IS NULL) THEN
		RAISE EXCEPTION 'Ungültiger Anteil.';
	END IF;
	IF p_mode = 'items' THEN v_items := share_normalize_items(p_items); END IF;

	SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id AND user_id = v_uid;
	IF NOT FOUND THEN RAISE EXCEPTION 'Ausgabe nicht gefunden.'; END IF;

	IF v_exp.shared_purchase_id IS NOT NULL THEN
		-- Bestehende Teilung: erst die Mitgliedschaft prüfen (ohne Sperre), dann sperren und neu lesen.
		SELECT * INTO v_sp FROM shared_purchases WHERE id = v_exp.shared_purchase_id;
		IF NOT FOUND THEN RAISE EXCEPTION 'Diese Teilung gibt es nicht mehr.'; END IF;
		IF NOT ((v_uid = v_sp.creator_id AND p_expense_id = v_sp.creator_expense_id)
			OR (v_uid = v_sp.partner_id AND p_expense_id = v_sp.partner_expense_id)) THEN
			RAISE EXCEPTION 'Ausgabe nicht gefunden.';
		END IF;
		PERFORM friend_lock(v_sp.creator_id, v_sp.partner_id);
		SELECT * INTO v_sp FROM shared_purchases WHERE id = v_exp.shared_purchase_id FOR UPDATE;
		IF NOT FOUND THEN RAISE EXCEPTION 'Diese Teilung gibt es nicht mehr.'; END IF;
		IF NOT EXISTS (
			SELECT 1 FROM friendships WHERE status = 'accepted'
			AND ((requester_id = v_sp.creator_id AND addressee_id = v_sp.partner_id) OR (requester_id = v_sp.partner_id AND addressee_id = v_sp.creator_id))
		) THEN
			RAISE EXCEPTION 'Ihr seid nicht mehr verbunden.';
		END IF;
		v_id := v_sp.id;
		v_creator := v_sp.creator_id;
		v_partner := v_sp.partner_id;
		v_creator_exp := v_sp.creator_expense_id;
		v_partner_exp := v_sp.partner_expense_id;
		v_total_cents := round(v_sp.total * 100)::bigint;
	ELSE
		-- Neue Teilung: creator = Aufrufer, partner = sein (angenommener) Freund.
		v_is_new := true;
		SELECT CASE WHEN requester_id = v_uid THEN addressee_id ELSE requester_id END INTO v_friend
		FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid);
		IF v_friend IS NULL THEN RAISE EXCEPTION 'Du hast noch keinen Freund verknüpft.'; END IF;
		PERFORM friend_lock(v_uid, v_friend);
		-- Nach dem Sperren neu lesen: die Freundschaft kann zwischenzeitlich gelöst worden sein.
		IF NOT EXISTS (
			SELECT 1 FROM friendships WHERE status = 'accepted'
			AND ((requester_id = v_uid AND addressee_id = v_friend) OR (requester_id = v_friend AND addressee_id = v_uid))
		) THEN
			RAISE EXCEPTION 'Du hast noch keinen Freund verknüpft.';
		END IF;
		SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id AND user_id = v_uid FOR UPDATE;
		IF NOT FOUND THEN RAISE EXCEPTION 'Ausgabe nicht gefunden.'; END IF;
		IF v_exp.shared_purchase_id IS NOT NULL THEN
			RAISE EXCEPTION 'Diese Ausgabe ist inzwischen schon geteilt.';
		END IF;
		-- Nicht teilbar: spiegelt isSpendingExpense (utils/transfer.ts) und isBudgetRelevantExpense (utils/funAccount.ts).
		IF v_exp.account_id IS NOT NULL
			OR coalesce(v_exp.category LIKE 'Konto:%', false)
			OR v_exp.transfer_id IS NOT NULL
			OR coalesce(v_exp.category IN ('Umbuchung', 'Manuelle Buchung'), false)
			OR round(v_exp.amount * 100) <= 0 THEN
			RAISE EXCEPTION 'Diese Buchung kann nicht geteilt werden.';
		END IF;
		v_id := NULL;
		v_creator := v_uid;
		v_partner := v_friend;
		v_creator_exp := p_expense_id;
		v_total_cents := round(v_exp.amount * 100)::bigint;
	END IF;

	-- Partner-Anteil in Cent (bei Artikeln dürfen negative Artikel wie Pfand-Rückgabe mitzählen).
	IF p_mode = 'percent' THEN
		v_partner_cents := round(v_total_cents * p_partner_percent / 100);
	ELSIF p_mode = 'amount' THEN
		v_partner_cents := round(p_partner_amount * 100);
	ELSE
		SELECT coalesce(sum(round((e->>'total_price')::numeric * 100)), 0) INTO v_partner_cents
		FROM jsonb_array_elements(v_items) e WHERE e->>'owner' = 'partner';
	END IF;
	IF v_partner_cents < 0 OR v_partner_cents > v_total_cents THEN
		RAISE EXCEPTION 'Die Artikel des Partners ergeben mehr als den Gesamtbetrag.';
	END IF;

	SELECT handle INTO v_creator_handle FROM profiles WHERE user_id = v_creator;
	SELECT handle INTO v_partner_handle FROM profiles WHERE user_id = v_partner;

	IF v_is_new THEN
		INSERT INTO expenses (user_id, description, amount, expense_date, category)
		VALUES (v_partner, v_exp.description, v_exp.amount, v_exp.expense_date, v_exp.category)
		RETURNING id INTO v_partner_exp;
		INSERT INTO shared_purchases (creator_id, partner_id, creator_expense_id, partner_expense_id, description, expense_date, category,
			total, mode, partner_percent, partner_amount, items, updated_by, updated_at, creator_seen_at, partner_seen_at)
		VALUES (v_creator, v_partner, v_creator_exp, v_partner_exp, v_exp.description, v_exp.expense_date, v_exp.category,
			v_total_cents::numeric / 100, p_mode, CASE WHEN p_mode = 'percent' THEN p_partner_percent END, v_partner_cents / 100, v_items,
			v_uid, v_now, CASE WHEN v_uid = v_creator THEN v_now END, CASE WHEN v_uid = v_partner THEN v_now END)
		RETURNING id INTO v_id;
	ELSE
		UPDATE shared_purchases SET
			mode = p_mode,
			partner_percent = CASE WHEN p_mode = 'percent' THEN p_partner_percent END,
			partner_amount = v_partner_cents / 100,
			items = v_items,
			updated_by = v_uid,
			updated_at = v_now,
			creator_seen_at = CASE WHEN v_uid = creator_id THEN v_now ELSE creator_seen_at END,
			partner_seen_at = CASE WHEN v_uid = partner_id THEN v_now ELSE partner_seen_at END
		WHERE id = v_id;
	END IF;

	-- Beide Ausgaben auf den Stand der Teilung bringen (Beschreibung, Datum und Kategorie kommen aus der Teilung).
	UPDATE expenses SET
		amount = (v_total_cents - v_partner_cents) / 100,
		shared_purchase_id = v_id,
		share_total = v_total_cents::numeric / 100,
		share_mode = p_mode,
		share_note = 'Geteilt mit ' || coalesce(v_partner_handle, 'Unbekannt')
	WHERE id = v_creator_exp AND user_id = v_creator;
	GET DIAGNOSTICS v_rows = ROW_COUNT;
	IF v_rows <> 1 THEN RAISE EXCEPTION 'Die Ausgabe des Erstellers gibt es nicht mehr.'; END IF;
	UPDATE expenses e SET
		description = s.description,
		expense_date = s.expense_date,
		category = s.category,
		amount = v_partner_cents / 100,
		shared_purchase_id = v_id,
		share_total = v_total_cents::numeric / 100,
		share_mode = p_mode,
		share_note = 'Von ' || coalesce(v_creator_handle, 'Unbekannt') || ' geteilt'
	FROM shared_purchases s
	WHERE s.id = v_id AND e.id = v_partner_exp AND e.user_id = v_partner;
	GET DIAGNOSTICS v_rows = ROW_COUNT;
	IF v_rows <> 1 THEN RAISE EXCEPTION 'Die Ausgabe des Freundes gibt es nicht mehr.'; END IF;

	-- Artikel: Kopien des Partners ersetzen, shared_away beim creator neu setzen.
	DELETE FROM receipt_items WHERE shared_purchase_id = v_id AND user_id = v_partner;
	UPDATE receipt_items SET shared_away = false, shared_purchase_id = NULL
	WHERE expense_id = v_creator_exp AND user_id = v_creator AND (shared_away OR shared_purchase_id IS NOT NULL);
	IF p_mode = 'items' THEN
		-- Nur Artikel des creators zu dieser Ausgabe, deren id dem Schlüssel entspricht ("local:-5" passt nie).
		UPDATE receipt_items ri SET shared_away = (i.owner = 'partner'), shared_purchase_id = v_id
		FROM (SELECT el->>'key' AS key, el->>'owner' AS owner FROM jsonb_array_elements(v_items) el) i
		WHERE ri.expense_id = v_creator_exp AND ri.user_id = v_creator
		  AND ri.id = CASE WHEN i.key ~ '^[0-9]{1,9}$' THEN i.key::integer END;
		INSERT INTO receipt_items (user_id, expense_id, product_id, name_raw, quantity, unit, unit_price, total_price, source, shared_purchase_id)
		SELECT v_partner, v_partner_exp, NULL, el->>'name_raw', (el->>'quantity')::numeric, el->>'unit', (el->>'unit_price')::numeric,
			(el->>'total_price')::numeric, 'shared', v_id
		FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(el, ord)
		WHERE el->>'owner' = 'partner'
		ORDER BY ord;
	END IF;
	RETURN v_id;
END;
$$;
--> statement-breakpoint
-- Teilung aufheben: die Ausgabe des creators ist wieder die volle Ausgabe, die Kopie des Partners verschwindet.
CREATE OR REPLACE FUNCTION public.unshare(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_sp shared_purchases%ROWTYPE;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	SELECT * INTO v_sp FROM shared_purchases WHERE id = p_id AND (creator_id = v_uid OR partner_id = v_uid);
	IF NOT FOUND THEN RAISE EXCEPTION 'Teilung nicht gefunden.'; END IF;
	PERFORM friend_lock(v_sp.creator_id, v_sp.partner_id);
	SELECT * INTO v_sp FROM shared_purchases WHERE id = p_id FOR UPDATE;
	IF NOT FOUND THEN RAISE EXCEPTION 'Teilung nicht gefunden.'; END IF;
	IF NOT EXISTS (
		SELECT 1 FROM friendships WHERE status = 'accepted'
		AND ((requester_id = v_sp.creator_id AND addressee_id = v_sp.partner_id) OR (requester_id = v_sp.partner_id AND addressee_id = v_sp.creator_id))
	) THEN
		RAISE EXCEPTION 'Ihr seid nicht mehr verbunden.';
	END IF;

	UPDATE expenses SET amount = v_sp.total, shared_purchase_id = NULL, share_total = NULL, share_mode = NULL, share_note = NULL
	WHERE id = v_sp.creator_expense_id AND user_id = v_sp.creator_id;
	UPDATE receipt_items SET shared_away = false, shared_purchase_id = NULL
	WHERE expense_id = v_sp.creator_expense_id AND user_id = v_sp.creator_id AND (shared_away OR shared_purchase_id IS NOT NULL);
	DELETE FROM receipt_items WHERE expense_id = v_sp.partner_expense_id AND user_id = v_sp.partner_id;
	DELETE FROM expenses WHERE id = v_sp.partner_expense_id AND user_id = v_sp.partner_id;
	DELETE FROM shared_purchases WHERE id = p_id;
END;
$$;
--> statement-breakpoint
-- Geteilten Einkauf ganz löschen: beide Ausgaben, alle Artikel beider Ausgaben und die Teilung.
CREATE OR REPLACE FUNCTION public.delete_shared(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_sp shared_purchases%ROWTYPE;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	SELECT * INTO v_sp FROM shared_purchases WHERE id = p_id AND (creator_id = v_uid OR partner_id = v_uid);
	IF NOT FOUND THEN RAISE EXCEPTION 'Teilung nicht gefunden.'; END IF;
	PERFORM friend_lock(v_sp.creator_id, v_sp.partner_id);
	SELECT * INTO v_sp FROM shared_purchases WHERE id = p_id FOR UPDATE;
	IF NOT FOUND THEN RAISE EXCEPTION 'Teilung nicht gefunden.'; END IF;
	IF NOT EXISTS (
		SELECT 1 FROM friendships WHERE status = 'accepted'
		AND ((requester_id = v_sp.creator_id AND addressee_id = v_sp.partner_id) OR (requester_id = v_sp.partner_id AND addressee_id = v_sp.creator_id))
	) THEN
		RAISE EXCEPTION 'Ihr seid nicht mehr verbunden.';
	END IF;

	DELETE FROM receipt_items
	WHERE (expense_id = v_sp.creator_expense_id AND user_id = v_sp.creator_id)
	   OR (expense_id = v_sp.partner_expense_id AND user_id = v_sp.partner_id);
	DELETE FROM expenses
	WHERE (id = v_sp.creator_expense_id AND user_id = v_sp.creator_id)
	   OR (id = v_sp.partner_expense_id AND user_id = v_sp.partner_id);
	DELETE FROM shared_purchases WHERE id = p_id;
END;
$$;
--> statement-breakpoint
-- Alles als gesehen markieren (nur für das eigene Konto). clock_timestamp() statt now(): innerhalb einer
-- Transaktion muss ein späteres Ereignis auch einen späteren Zeitstempel haben.
CREATE OR REPLACE FUNCTION public.mark_shares_seen() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	UPDATE shared_purchases SET creator_seen_at = clock_timestamp() WHERE creator_id = v_uid;
	UPDATE shared_purchases SET partner_seen_at = clock_timestamp() WHERE partner_id = v_uid;
END;
$$;
--> statement-breakpoint
-- Erweitert 0012: unseenShares zählt die Teilungen, die die andere Person zuletzt geändert hat und die ich noch nicht gesehen habe.
-- (bewusst VOLATILE, wie in 0012: muss die Änderungen der aufrufenden Funktion im selben Statement sehen)
CREATE OR REPLACE FUNCTION public.friend_state_for(p_uid uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
	SELECT jsonb_build_object(
		'handle', (SELECT pr.handle FROM profiles pr WHERE pr.user_id = p_uid),
		'friend', (
			SELECT jsonb_build_object('handle', pr.handle)
			FROM friendships f
			JOIN profiles pr ON pr.user_id = CASE WHEN f.requester_id = p_uid THEN f.addressee_id ELSE f.requester_id END
			WHERE f.status = 'accepted' AND (f.requester_id = p_uid OR f.addressee_id = p_uid)
			LIMIT 1
		),
		'outgoing', (
			SELECT jsonb_build_object('id', f.id, 'handle', pr.handle)
			FROM friendships f
			JOIN profiles pr ON pr.user_id = f.addressee_id
			WHERE f.status = 'pending' AND f.requester_id = p_uid
			LIMIT 1
		),
		'incoming', COALESCE((
			SELECT jsonb_agg(jsonb_build_object('id', f.id, 'handle', pr.handle, 'created_at', f.created_at) ORDER BY f.created_at, f.id)
			FROM friendships f
			JOIN profiles pr ON pr.user_id = f.requester_id
			WHERE f.status = 'pending' AND f.addressee_id = p_uid
		), '[]'::jsonb),
		'unseenShares', (
			SELECT count(*)::int FROM shared_purchases s
			WHERE (s.creator_id = p_uid AND s.updated_by <> p_uid AND s.updated_at > coalesce(s.creator_seen_at, '-infinity'::timestamptz))
			   OR (s.partner_id = p_uid AND s.updated_by <> p_uid AND s.updated_at > coalesce(s.partner_seen_at, '-infinity'::timestamptz))
		)
	);
$$;
--> statement-breakpoint
-- Erweitert 0012: Verbindung trennen löst alle Teilungen. Die Ausgaben bleiben bei beiden stehen (shared_purchase_id
-- wird über ON DELETE SET NULL zu NULL, share_note und share_total bleiben), nur die Zeilen in shared_purchases entfallen.
CREATE OR REPLACE FUNCTION public.end_friendship() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_friend uuid;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	SELECT CASE WHEN requester_id = v_uid THEN addressee_id ELSE requester_id END INTO v_friend
	FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid);
	IF v_friend IS NOT NULL THEN
		PERFORM friend_lock(v_uid, v_friend);
		DELETE FROM shared_purchases
		WHERE (creator_id = v_uid AND partner_id = v_friend) OR (creator_id = v_friend AND partner_id = v_uid);
		DELETE FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid);
	END IF;
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
-- Funktions-Rechte: Clients dürfen nur die öffentlichen Funktionen aufrufen, nie die internen Hilfen.
REVOKE ALL ON FUNCTION public.share_normalize_items(jsonb), public.friend_state_for(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.save_share(integer, text, numeric, numeric, jsonb), public.unshare(uuid), public.delete_shared(uuid), public.mark_shares_seen(), public.end_friendship() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.save_share(integer, text, numeric, numeric, jsonb), public.unshare(uuid), public.delete_shared(uuid), public.mark_shares_seen(), public.end_friendship() TO authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.share_normalize_items(jsonb), public.friend_state_for(uuid) TO service_role;
