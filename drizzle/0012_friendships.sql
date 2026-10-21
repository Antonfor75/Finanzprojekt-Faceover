-- Geteilte Einkäufe, Teil 1: Kontonamen (profiles) und Freundschaften (friendships).
-- Geschrieben wird ausschließlich über die SECURITY-DEFINER-Funktionen weiter unten; die Tabellen
-- haben bewusst keine INSERT-/UPDATE-/DELETE-Rechte für authenticated. Jedes Konto hat höchstens
-- eine angenommene Freundschaft und höchstens eine offene ausgehende Anfrage.
CREATE TABLE IF NOT EXISTS "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"handle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_handle_unique" UNIQUE ("handle"),
	CONSTRAINT "profiles_handle_format" CHECK ("handle" ~ '^[a-z0-9._]{3,20}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"addressee_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted')),
	CONSTRAINT "friendships_not_self" CHECK ("requester_id" <> "addressee_id")
);
--> statement-breakpoint
-- Pro Paar höchstens eine Zeile, egal wer angefragt hat.
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_unique" ON "friendships" (least("requester_id", "addressee_id"), greatest("requester_id", "addressee_id"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_requester_idx" ON "friendships" ("requester_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_addressee_idx" ON "friendships" ("addressee_id");
--> statement-breakpoint
-- RLS: nur Lesen, und nur eigene Zeilen. Keine Schreib-Policies.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "friendships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_select_own" ON "profiles";
--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON "profiles" FOR SELECT TO authenticated USING (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "friendships_select_own" ON "friendships";
--> statement-breakpoint
CREATE POLICY "friendships_select_own" ON "friendships" FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
--> statement-breakpoint
-- Tabellen-Rechte (bei Anlage über die Direktverbindung greifen die Default-GRANTs nicht).
REVOKE ALL ON TABLE "profiles" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "friendships" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE "profiles" TO authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE "friendships" TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE "profiles" TO service_role;
--> statement-breakpoint
GRANT ALL ON TABLE "friendships" TO service_role;
--> statement-breakpoint
-- Interne Hilfen (nicht für Clients): sperren beide Konten in fester Reihenfolge (kein Deadlock),
-- bauen den Zustand für ein Konto und nehmen eine Anfrage an.
CREATE OR REPLACE FUNCTION public.friend_lock(p_a uuid, p_b uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtext(least(p_a, p_b)::text));
	PERFORM pg_advisory_xact_lock(hashtext(greatest(p_a, p_b)::text));
END;
$$;
--> statement-breakpoint
-- (bewusst VOLATILE: muss die Änderungen der aufrufenden Funktion im selben Statement sehen)
CREATE OR REPLACE FUNCTION public.friend_state_for(p_uid uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
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
		'unseenShares', 0
	);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.friend_accept(p_request_id uuid, p_a uuid, p_b uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
	UPDATE friendships SET status = 'accepted', responded_at = now() WHERE id = p_request_id;
	-- Alle übrigen offenen Anfragen beider Personen (egal ob gestellt oder erhalten) entfallen.
	DELETE FROM friendships
	WHERE status = 'pending' AND id <> p_request_id
	  AND (requester_id IN (p_a, p_b) OR addressee_id IN (p_a, p_b));
END;
$$;
--> statement-breakpoint
-- Öffentliche Funktionen (für angemeldete Konten).
CREATE OR REPLACE FUNCTION public.set_my_handle(p_handle text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_handle text;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	v_handle := lower(btrim(coalesce(p_handle, ''), E' \t\r\n'));
	IF v_handle !~ '^[a-z0-9._]{3,20}$' THEN
		RAISE EXCEPTION 'Der Kontoname darf nur a–z, 0–9, . und _ enthalten (3–20 Zeichen).';
	END IF;
	PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));
	IF EXISTS (SELECT 1 FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid)) THEN
		RAISE EXCEPTION 'Solange du verbunden bist, kannst du den Namen nicht ändern.';
	END IF;
	IF EXISTS (SELECT 1 FROM profiles WHERE handle = v_handle AND user_id <> v_uid) THEN
		RAISE EXCEPTION 'Dieser Kontoname ist schon vergeben.';
	END IF;
	BEGIN
		INSERT INTO profiles (user_id, handle) VALUES (v_uid, v_handle)
		ON CONFLICT (user_id) DO UPDATE SET handle = EXCLUDED.handle;
	EXCEPTION WHEN unique_violation THEN
		-- Zwei Konten wollten gleichzeitig denselben Namen.
		RAISE EXCEPTION 'Dieser Kontoname ist schon vergeben.';
	END;
	RETURN v_handle;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_friend_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	v_uid uuid := auth.uid();
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.send_friend_request(p_handle text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_target uuid;
	v_target_handle text;
	v_incoming uuid;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid) THEN
		RAISE EXCEPTION 'Gib dir zuerst einen eigenen Kontonamen.';
	END IF;
	SELECT user_id INTO v_target FROM profiles WHERE handle = lower(btrim(coalesce(p_handle, ''), E' \t\r\n'));
	IF v_target IS NULL THEN RAISE EXCEPTION 'Kein Konto mit diesem Namen gefunden.'; END IF;
	IF v_target = v_uid THEN RAISE EXCEPTION 'Das bist du selbst.'; END IF;

	PERFORM friend_lock(v_uid, v_target);
	-- Nach dem Sperren neu lesen: der Name kann sich zwischenzeitlich geändert haben.
	SELECT handle INTO v_target_handle FROM profiles WHERE user_id = v_target;
	IF v_target_handle IS NULL THEN RAISE EXCEPTION 'Kein Konto mit diesem Namen gefunden.'; END IF;

	IF EXISTS (SELECT 1 FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid)) THEN
		RAISE EXCEPTION 'Du bist schon mit jemandem verbunden.';
	END IF;
	IF EXISTS (SELECT 1 FROM friendships WHERE status = 'accepted' AND (requester_id = v_target OR addressee_id = v_target)) THEN
		RAISE EXCEPTION '% ist schon mit jemandem verbunden.', v_target_handle;
	END IF;

	-- Hat die andere Person schon an mich geschickt, wird deren Anfrage angenommen.
	SELECT id INTO v_incoming FROM friendships
	WHERE status = 'pending' AND requester_id = v_target AND addressee_id = v_uid;
	IF v_incoming IS NOT NULL THEN
		PERFORM friend_accept(v_incoming, v_uid, v_target);
		RETURN friend_state_for(v_uid);
	END IF;

	IF EXISTS (SELECT 1 FROM friendships WHERE status = 'pending' AND requester_id = v_uid) THEN
		RAISE EXCEPTION 'Du hast schon eine offene Anfrage.';
	END IF;

	INSERT INTO friendships (requester_id, addressee_id, status) VALUES (v_uid, v_target, 'pending');
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cancel_friend_request() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	v_uid uuid := auth.uid();
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));
	DELETE FROM friendships WHERE status = 'pending' AND requester_id = v_uid;
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_request_id uuid, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_requester uuid;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	SELECT requester_id INTO v_requester FROM friendships
	WHERE id = p_request_id AND status = 'pending' AND addressee_id = v_uid;
	IF v_requester IS NULL THEN RAISE EXCEPTION 'Anfrage nicht gefunden.'; END IF;

	PERFORM friend_lock(v_uid, v_requester);
	-- Nach dem Sperren noch einmal prüfen: die Anfrage kann inzwischen zurückgezogen worden sein.
	IF NOT EXISTS (SELECT 1 FROM friendships WHERE id = p_request_id AND status = 'pending' AND addressee_id = v_uid) THEN
		RAISE EXCEPTION 'Anfrage nicht gefunden.';
	END IF;

	IF p_accept THEN
		PERFORM friend_accept(p_request_id, v_uid, v_requester);
	ELSE
		DELETE FROM friendships WHERE id = p_request_id;
	END IF;
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.end_friendship() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_friend uuid;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	SELECT CASE WHEN requester_id = v_uid THEN addressee_id ELSE requester_id END INTO v_friend
	FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid);
	IF v_friend IS NOT NULL THEN
		PERFORM friend_lock(v_uid, v_friend);
		-- Das Lösen der Teilungen kommt mit der Teilungs-Migration (0013) dazu.
		DELETE FROM friendships WHERE status = 'accepted' AND (requester_id = v_uid OR addressee_id = v_uid);
	END IF;
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
-- Funktions-Rechte: Clients dürfen nur die öffentlichen Funktionen aufrufen, nie die internen Hilfen.
REVOKE ALL ON FUNCTION public.friend_lock(uuid, uuid), public.friend_state_for(uuid), public.friend_accept(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_my_handle(text), public.get_friend_state(), public.send_friend_request(text), public.cancel_friend_request(), public.respond_friend_request(uuid, boolean), public.end_friendship() FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_my_handle(text), public.get_friend_state(), public.send_friend_request(text), public.cancel_friend_request(), public.respond_friend_request(uuid, boolean), public.end_friendship() TO authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_lock(uuid, uuid), public.friend_state_for(uuid), public.friend_accept(uuid, uuid, uuid) TO service_role;
