-- Freunde (Kontoname, Freundschaft, geteilte Einkäufe) nur für Konten mit Kassenbon-Scan
-- (app_metadata.receipt_scan = true, gesetzt in der Chefansicht). Das gilt auch für die Handy-App,
-- die diese Funktionen direkt aufruft — deshalb sitzt die Prüfung hier in der Datenbank und nicht
-- nur in der Oberfläche. app_metadata kann nur die Service-Role ändern, der Nutzer selbst nicht.
--
-- Geprüft wird beim Entstehen einer Freundschaft: Kontoname vergeben, Anfrage senden, Anfrage annehmen.
-- Ablehnen, Zurückziehen und Trennen bleiben immer erlaubt. Ohne Freundschaft gibt es auch keine Teilung
-- (save_share verlangt eine angenommene Freundschaft). Wird der Scan abgeschaltet, löschen
-- app/actions/admin.ts und die chef-admin Edge Function Freundschaften und Teilungen des Kontos
-- (endUserSharing in utils/accountDeletion.ts).

-- Interne Hilfe (nicht für Clients): ist der Kassenbon-Scan für dieses Konto freigeschaltet?
CREATE OR REPLACE FUNCTION public.has_receipt_scan(p_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
	SELECT coalesce((SELECT u.raw_app_meta_data ->> 'receipt_scan' = 'true' FROM auth.users u WHERE u.id = p_uid), false);
$$;
--> statement-breakpoint
-- Erweitert 0012: nur mit Kassenbon-Scan.
CREATE OR REPLACE FUNCTION public.set_my_handle(p_handle text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_handle text;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	IF NOT has_receipt_scan(v_uid) THEN RAISE EXCEPTION 'Freunde sind für dein Konto nicht freigeschaltet.'; END IF;
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
-- Erweitert 0012: nur mit Kassenbon-Scan, und nur an Konten mit Kassenbon-Scan. Ein Konto ohne Scan
-- wird wie "nicht gefunden" behandelt, damit sich nicht erkennen lässt, ob es existiert.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_handle text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	v_uid uuid := auth.uid();
	v_target uuid;
	v_target_handle text;
	v_incoming uuid;
BEGIN
	IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
	IF NOT has_receipt_scan(v_uid) THEN RAISE EXCEPTION 'Freunde sind für dein Konto nicht freigeschaltet.'; END IF;
	IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = v_uid) THEN
		RAISE EXCEPTION 'Gib dir zuerst einen eigenen Kontonamen.';
	END IF;
	SELECT user_id INTO v_target FROM profiles WHERE handle = lower(btrim(coalesce(p_handle, ''), E' \t\r\n'));
	IF v_target IS NULL OR NOT has_receipt_scan(v_target) THEN RAISE EXCEPTION 'Kein Konto mit diesem Namen gefunden.'; END IF;
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
-- Erweitert 0012: Annehmen nur mit Kassenbon-Scan (Ablehnen geht immer).
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_request_id uuid, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
		IF NOT has_receipt_scan(v_uid) OR NOT has_receipt_scan(v_requester) THEN
			RAISE EXCEPTION 'Freunde sind für dieses Konto nicht freigeschaltet.';
		END IF;
		PERFORM friend_accept(p_request_id, v_uid, v_requester);
	ELSE
		DELETE FROM friendships WHERE id = p_request_id;
	END IF;
	RETURN friend_state_for(v_uid);
END;
$$;
--> statement-breakpoint
-- Funktions-Rechte: die Hilfe ist nur für die Service-Role.
REVOKE ALL ON FUNCTION public.has_receipt_scan(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_my_handle(text), public.send_friend_request(text), public.respond_friend_request(uuid, boolean) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.has_receipt_scan(uuid) TO service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_my_handle(text), public.send_friend_request(text), public.respond_friend_request(uuid, boolean) TO authenticated, service_role;
