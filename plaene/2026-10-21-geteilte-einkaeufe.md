# Geteilte Einkäufe mit einem Freund – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei Konten verknüpfen sich (genau ein Freund) und teilen Ausgaben nach Betrag oder nach Artikeln. Jeder hat danach nur seinen Anteil als normale Ausgabe, in Web-App und Handy-App.

**Architecture:**
- **Eine Teilung als Quelle der Wahrheit.** Jede Teilung ist eine Zeile `shared_purchases`, die beiden Personen gehört. Aus ihr schreiben Postgres-Funktionen (`SECURITY DEFINER`, RPC) beide `expenses`-Zeilen und die Artikel-Kopien des Partners. Nur diese Funktionen schreiben je in ein fremdes Konto.
- **Web-App:** ruft die RPCs über Server Actions auf.
- **Handy-App:** ruft dieselben RPCs über `supabaseRemote` innerhalb von `withNetwork(...)` auf und holt die Ergebnisse über den normalen Abgleich. Ihre lokal gebliebenen Artikel gleicht sie per Merker `shared_away` ab.
- **Sparkonto:** Es gibt keinen Sparkonto-Baustein. Alles Sichtbare rechnet sich ohnehin live aus den Ausgaben.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase (Postgres, RLS, RPC), Vitest, Playwright, `postgres` (Node) für DB-Tests, Dexie (Handy-App), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-21-geteilte-einkaeufe-design.md` · UI-Entwürfe: https://claude.ai/artifact/BaYGrPP3PqZ6Kfh7swBhHz (gewählt: A3, B4, C4, D1-Final, E1)

**Repos:**
- **Web:** dieses Repo. Arbeiten auf dem Branch `claude/shared-expense-splitting-c3e1a9`.
- **Handy:** `C:\Anton\Cashflow-AndroidApp`. Dort vor Task 9 einen Branch `feature/geteilte-einkaeufe` anlegen.

## Global Constraints

- **Sprache und Gestaltung:**
  - UI-Texte sind deutsch.
  - Nur Theme-Variablen und semantische Utilities (`bg-primary`, `text-foreground`, `bg-muted`), keine Rohfarben wie `red-500`.
  - Die Partnerfarbe ist eine neue Theme-Variable `--color-partner` in jedem Theme-Block von `app/globals.css`, z. B. `#33618F` im Default-Theme, mit Utility `bg-partner` / `text-partner`.
  - Nur Tailwind v4. Keyframes kommen nach `app/globals.css`.
- **Geld:**
  - Gerechnet wird in **Cent** (Integer).
  - Der Partner-Anteil wird gerundet (`Math.round`, in SQL `round()`), die eintragende Person (creator) bekommt den Rest. Die Summe ist immer exakt der Gesamtbetrag.
  - Der Partner-Anteil liegt im Bereich `0 ≤ partner ≤ total`.
- **Kontoname:**
  - Muster `^[a-z0-9._]{3,20}$`. Gespeichert wird getrimmt und klein geschrieben.
  - Die Suche findet nur den exakten Namen.
  - Ändern geht nur, solange keine angenommene Freundschaft besteht.
- **Freundschaft:**
  - Höchstens **eine** angenommene Freundschaft pro Konto.
  - Höchstens eine offene **ausgehende** Anfrage. Eingehende dürfen es mehrere sein.
  - Nimmt man eine an, werden alle übrigen offenen Anfragen beider Personen gelöscht.
- **Nicht teilbar** ist eine Ausgabe mit `account_id`, einer Kategorie, die mit `Konto:` beginnt, `transfer_id`, Kategorie `Umbuchung` oder `Manuelle Buchung`. Das ist die Regel `isSpendingExpense` aus `utils/transfer.ts`.
- **Benachrichtigung:** nur beim Öffnen bzw. Abgleich, keine Push-Nachrichten.
- **Ändern:** Beide Personen dürfen ändern, die letzte Änderung gilt.
- **Verbindung trennen:** löst alle Teilungen. Die Ausgaben bleiben bei beiden als normale Ausgaben mit ihrem Hinweistext stehen.
- **Handy-App:**
  - Internet nur innerhalb von `withNetwork(...)`. Teilen ist offline deaktiviert und zeigt den Text „Teilen braucht Internet“.
  - Artikel gehen nur bei nach Artikeln geteilten Bons online, als `items` im RPC-Aufruf. `PUSH_EXCLUDED_TABLES` bleibt unverändert.
- **Animationen:** Bei `prefers-reduced-motion: reduce` ersetzt eine 150-ms-Überblendung Taube, Brief und Schwimmen.
- **Datenbank:**
  - Migrationen werden von Hand geschrieben: SQL in `drizzle/`, dazu Journal-Eintrag und Snapshot (vorheriger Snapshot plus neue Tabellen, `users` bleibt drin, siehe Memory „Drizzle users snapshot drift“).
  - **Nie** `drizzle-kit migrate` und nie `drizzle-kit generate`.
  - Jede neue Tabelle bekommt explizite GRANTs (`authenticated`, `service_role`) und danach `NOTIFY pgrst, 'reload schema'`.
- **Live-Datenbank:** Eingespielt wird nur nach ausdrücklichem OK des Nutzers (Task 8). Vorher immer `--dry-run`.
- **Repo ist öffentlich:** keine Logs, `.env`-Werte oder Testkonten-Zugänge committen.

## Review Focus

1. **Gleichzeitiges Ändern durch beide.** Beide Ausgaben müssen danach zum selben Stand der Teilung passen. Kein halber Stand: `save_share` sperrt die Zeile mit `FOR UPDATE` und schreibt alles in einer Transaktion. Test in Task 3.
2. **Artikelsumme ≠ Bon-Betrag** (Rabatt, Pfand-Rückgabe mit negativem Preis):
   - Der Partner-Anteil ist die Summe seiner Artikel und darf negative Artikel enthalten.
   - Liegt das Ergebnis außerhalb von `0..total`, kommt die Meldung „Die Artikel des Partners ergeben mehr als den Gesamtbetrag.“ statt falscher Beträge.
   - Test in Task 1 (rein) und Task 3 (SQL).
3. **Normales Löschen bzw. Bearbeiten einer geteilten Ausgabe** im Verlauf darf nicht still nur die eigene Kopie ändern:
   - `deleteExpense` und `updateExpense` (Web) sowie `deleteExpenseLocal` und `updateExpenseLocal` (Handy) leiten um bzw. lehnen ab.
   - Tests in Task 4 und Task 9.
4. **Konto löschen** (`deleteOwnAccount`, Admin):
   - Freundschaft und Teilungen verschwinden.
   - Die Kopie des Freundes bleibt als normale Ausgabe stehen (`shared_purchase_id` wird `NULL`).
   - Test in Task 3.
5. **Kontoname mit Leerzeichen, Großbuchstaben oder als eigener Name:**
   - `" Lena "` → `lena`.
   - „Name vergeben“ zählt ohne Rücksicht auf Groß- und Kleinschreibung.
   - Eine Anfrage an sich selbst bringt „Das bist du selbst.“
   - Hat das Ziel schon einen Freund, kommt „<name> ist schon mit jemandem verbunden.“
   - Test in Task 2.

---

## Dateiübersicht

**Web (neu):**
- `utils/sharing/split.ts`: Cent-Rechnung, Artikel-Summen, Owner umschalten (rein)
- `utils/sharing/display.ts`: Texte für Hinweis und Untertitel im Verlauf (rein)
- `utils/sharing/api.ts`: dünne, typisierte Hülle um alle RPCs; nimmt einen Supabase-Client und wird 1:1 in die Handy-App kopiert
- `utils/sharing/types.ts`: gemeinsame Typen; wird 1:1 kopiert
- `drizzle/0012_friendships.sql`, `drizzle/0013_shared_purchases.sql`, dazu Journal und Snapshots
- `scripts/apply-0012-friendships.mjs`, `scripts/apply-0013-shared-purchases.mjs` (Muster wie `apply-0010-…`)
- `tests/db/dbTest.ts` (Hilfen), `tests/db/friendships.db.test.ts`, `tests/db/sharing.db.test.ts`, `vitest.db.config.ts`
- `app/actions/sharing.ts`: Server Actions
- `components/sharing/`: `Dove.tsx`, `FriendLinkView.tsx` (A3), `FriendRequestLetter.tsx` (B4), `SharesChangedBanner.tsx`, `ShareSheet.tsx` (C4), `ItemSplitBoard.tsx` (D1-Final), `ShareBadge.tsx` (E1)
- `e2e/sharing.spec.ts`

**Web (ändern):**
- `src/db/schema.ts`, `app/types.ts`
- `app/actions.ts`: Schutz für geteilte Ausgaben in `updateExpense` und `deleteExpense`
- `components/SettingsOverlay.tsx`: Einstieg „Gemeinsam teilen“
- `components/MobileDashboard.tsx`: Startabfrage, Brief, Banner
- `components/dashboard/HistoryView.tsx`: Badge, Knopf „Teilen“ / „Teilung ändern“
- `components/AddExpenseForm.tsx`, `components/receipt/ReceiptScanView.tsx`: Schalter „Mit <name> teilen“
- `components/analysis/BasketTab.tsx` bzw. die Artikel-Auswertung: `shared_away` ausblenden
- `app/globals.css`: `--color-partner` und Keyframes
- `utils/girokonto.test.ts`: Test für alte Woche
- `plaene/UEBERSICHT.md`

**Handy (`C:\Anton\Cashflow-AndroidApp`):**
- Kopien von `utils/sharing/{split,display,api,types}.ts`
- neu `utils/sharingSync.ts`: Abgleich nach dem Sync, Merker für lokale Artikel
- `utils/localdb.ts`: neue Dexie-Version
- `components/MobileDashboard.tsx`, `components/SettingsOverlay.tsx`, Verlauf und Eintragen gespiegelt
- `components/sharing/*`: gespiegelt, mit Online-Sperre
- die Artikel-Auswertungen (`utils/basketAnalysis.ts`, `utils/basketStore.ts`): `shared_away` ausblenden

---

### Task 1: Rechen- und Text-Grundlagen (rein, Web)

**Files:**
- Create: `utils/sharing/types.ts`, `utils/sharing/split.ts`, `utils/sharing/display.ts`
- Test: `utils/sharing/split.test.ts`, `utils/sharing/display.test.ts`, `utils/girokonto.test.ts` (ergänzen)

**Interfaces:**
- Produces (`types.ts`):
  - `type ShareMode = 'percent' | 'amount' | 'items'`
  - `type ItemOwner = 'creator' | 'partner'`
  - `type ShareItem = { key: string; name_raw: string; quantity: number; unit: 'stk' | 'kg' | null; unit_price: number | null; total_price: number; owner: ItemOwner }`
    - `key`: Server-Artikel `"<receipt_items.id>"`, lokaler Handy-Artikel `"local:<id>"`
  - `type FriendState = { handle: string | null; friend: { handle: string } | null; outgoing: { id: string; handle: string } | null; incoming: { id: string; handle: string; created_at: string }[]; unseenShares: number }`
  - `type SharedPurchase = { id: string; creator_id: string; partner_id: string; creator_expense_id: number; partner_expense_id: number; description: string; expense_date: string; category: string | null; total: number; mode: ShareMode; partner_percent: number | null; partner_amount: number; items: ShareItem[]; updated_by: string; updated_at: string }`
  - `type SaveShareInput = { expenseId: number; mode: ShareMode; partnerPercent?: number; partnerAmount?: number; items?: ShareItem[] }`
- Produces (`split.ts`):
  - `toCents(v: number | string): number`
  - `partnerCentsForPercent(totalCents: number, percent: number): number`
  - `partnerCentsForItems(items: ShareItem[]): number`
  - `splitCents(totalCents: number, partnerCents: number): { creatorCents: number; partnerCents: number }`: wirft `Error('Die Artikel des Partners ergeben mehr als den Gesamtbetrag.')`, wenn außerhalb `0..total`
  - `toggleOwner(items: ShareItem[], key: string): ShareItem[]`
  - `initialItems(items: Omit<ShareItem, 'owner'>[]): ShareItem[]`: alle `owner: 'creator'`
- Produces (`display.ts`):
  - `shareBadgeText(e: Pick<Expense, 'amount' | 'share_total' | 'share_mode' | 'share_note'>): string | null`: z. B. `"Geteilt mit lena · 50 %"`, `"Von lena geteilt · Artikel"`; `null` bei nicht geteilt. Die Prozentzahl ist der **eigene** Anteil, `round(amount / share_total * 100)`.
  - `shareSubline(e): string | null` → `"von 19,48 €"`

- [ ] **Step 1: Failing tests in `split.test.ts`.**
  - `partnerCentsForPercent(1948, 50) === 974`
  - `partnerCentsForPercent(1001, 33.33) === 334`
  - `splitCents(1948, 952)` ergibt `{ creatorCents: 996, partnerCents: 952 }`
  - `splitCents(1948, 2000)` wirft die exakte Meldung oben
  - `partnerCentsForItems` mit Partner-Artikeln `[3.29, 2.79, 1.95, 1.49]` und einem Creator-Artikel ergibt `952`
  - `partnerCentsForItems` mit einem negativen Partner-Artikel `-0.25` zieht ihn ab
  - `toggleOwner` dreht nur den Artikel mit diesem Schlüssel und lässt die Reihenfolge stehen
  - `initialItems` setzt alle auf `creator`
  - `toCents('19.48') === 1948` und `toCents(0.1 + 0.2) === 30`
- [ ] **Step 2: Failing tests in `display.test.ts`.**
  - Eine nicht geteilte Ausgabe ergibt `null`.
  - `{amount: 9.96, share_total: 19.48, share_mode: 'items', share_note: 'Geteilt mit lena'}` ergibt den Hinweis `"Geteilt mit lena · Artikel"` und den Untertitel `"von 19,48 €"`.
  - `{amount: 6.43, share_total: 12.85, share_mode: 'percent', share_note: 'Geteilt mit lena'}` ergibt `"Geteilt mit lena · 50 %"`.
  - Eine abgetrennte Ausgabe (`shared_purchase_id: null`, aber `share_note` gesetzt) zeigt den Hinweis weiter.
- [ ] **Step 3: Failing test in `utils/girokonto.test.ts`: `it('Teilen einer Ausgabe in einer alten Woche ändert den Kontostand ab diesem Tag')`.**
  - Gleiche Daten zweimal rechnen: einmal mit Betrag 19,48 am Datum vor 3 Wochen, einmal mit 9,96.
  - Der Endstand unterscheidet sich um genau 9,52.
  - Die Tage vor dem Datum sind gleich.
- [ ] **Step 4: `npm run test -- utils/sharing utils/girokonto` → FAIL** (Module fehlen; der Girokonto-Test sollte direkt grün sein, sonst Befund melden).
- [ ] **Step 5: Implement `types.ts`, `split.ts`, `display.ts`** mit den Signaturen oben. `Expense` bekommt die Felder erst in Task 4: bis dahin lokal den Typ `ShareableExpense` in `display.ts` definieren.
- [ ] **Step 6: `npm run test -- utils/sharing utils/girokonto` → PASS.**
- [ ] **Step 7: Commit:** `feat(sharing): Teilungs-Rechnung und Verlaufstexte (rein, getestet)`

---

### Task 2: Kontonamen und Freundschaften (DB, Web)

**Files:**
- Create: `drizzle/0012_friendships.sql`, Journal-Eintrag in `drizzle/meta/_journal.json`, `drizzle/meta/0012_snapshot.json`, `scripts/apply-0012-friendships.mjs`
- Create: `vitest.db.config.ts`, `tests/db/dbTest.ts`, `tests/db/friendships.db.test.ts`
- Modify: `package.json` (Skript `"test:db": "vitest run --config vitest.db.config.ts"`)

**Interfaces:**
- **Test-Hilfen** (`tests/db/dbTest.ts`):
  - `dbTest(name, fn: (tx: TransactionSql) => Promise<void>)`
    - öffnet die Verbindung wie `scripts/apply-0010-…` (DATABASE_URL, optional `POOLER_HOST`)
    - führt `fn` in einer Transaktion aus, die **immer** mit ROLLBACK endet
    - überspringt den Test ohne `DATABASE_URL`
  - `makeUser(tx, email): Promise<string>` legt eine Zeile in `auth.users` an, nur innerhalb der Transaktion.
  - `asUser(tx, userId)` setzt `set local role authenticated` und `set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}'`.
  - `asAdmin(tx)` setzt `reset role`.
- **Tabellen:**
  - `profiles(user_id uuid PK REFERENCES auth.users ON DELETE CASCADE, handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9._]{3,20}$'), created_at timestamptz DEFAULT now())`
  - `friendships(id uuid PK DEFAULT gen_random_uuid(), requester_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE, addressee_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE, status text NOT NULL CHECK (status IN ('pending','accepted')), created_at timestamptz DEFAULT now(), responded_at timestamptz, CHECK (requester_id <> addressee_id))`
  - Eindeutiger Index auf `(least(requester_id, addressee_id), greatest(requester_id, addressee_id))`.
- **RLS:**
  - `profiles` SELECT nur der eigenen Zeile.
  - `friendships` SELECT, wenn `auth.uid()` eine der beiden Personen ist.
  - Keine INSERT-, UPDATE- oder DELETE-Policies: Geschrieben wird nur über die Funktionen.
  - GRANT SELECT an `authenticated`, ALL an `service_role`.
- **RPCs** (alle `SECURITY DEFINER SET search_path = public`; sie prüfen `auth.uid() IS NOT NULL` und sperren je beteiligtem Konto `pg_advisory_xact_lock(hashtext(uid::text))`; Fehler werfen sie als `RAISE EXCEPTION '<deutscher Text>'`):
  - `set_my_handle(p_handle text) RETURNS text`: normalisiert und gibt den Namen zurück.
    - Fehlermeldungen: „Der Kontoname darf nur a–z, 0–9, . und _ enthalten (3–20 Zeichen).“, „Dieser Kontoname ist schon vergeben.“, „Solange du verbunden bist, kannst du den Namen nicht ändern.“
  - `get_friend_state() RETURNS jsonb`: hat die Form von `FriendState` aus Task 1. `unseenShares` ist in Task 3 noch `0`.
  - `send_friend_request(p_handle text) RETURNS jsonb`: gibt den State zurück.
    - Fehlermeldungen: „Gib dir zuerst einen eigenen Kontonamen.“, „Kein Konto mit diesem Namen gefunden.“, „Das bist du selbst.“, „Du bist schon mit jemandem verbunden.“, „<name> ist schon mit jemandem verbunden.“, „Du hast schon eine offene Anfrage.“
    - Hat das Ziel selbst schon eine offene Anfrage an den Aufrufer geschickt, wird diese angenommen statt eine neue anzulegen.
  - `cancel_friend_request() RETURNS jsonb`: löscht die eigene offene ausgehende Anfrage.
  - `respond_friend_request(p_request_id uuid, p_accept boolean) RETURNS jsonb`:
    - Annehmen setzt `accepted` und `responded_at` und löscht alle anderen `pending`-Zeilen beider Personen.
    - Ablehnen löscht die Zeile.
    - Nur die angefragte Person darf antworten.
  - `end_friendship() RETURNS jsonb`: löscht die angenommene Freundschaft. Das Lösen der Teilungen kommt in Task 3 dazu.
  - GRANT EXECUTE an `authenticated`.

- [ ] **Step 1: Write `tests/db/dbTest.ts` und `vitest.db.config.ts`** (Include `tests/db/**/*.db.test.ts`, `testTimeout: 30000`, `fileParallelism: false`).
- [ ] **Step 2: Failing tests in `friendships.db.test.ts`.** Alle laufen als `asUser`, die SQL-Dateien 0012 werden im Test vorher per `tx.unsafe` in derselben Transaktion eingespielt.
  - `set_my_handle(' Lena ')` gibt `'lena'` zurück.
  - Ein zweites Konto mit `'LENA'` scheitert mit „Dieser Kontoname ist schon vergeben.“
  - `'ab'` scheitert mit der Musterregel-Meldung.
  - **Anfragen:**
    - A schickt an `lena`, B sieht in `get_friend_state().incoming` genau eine Anfrage mit `handle = 'anton'`.
    - B nimmt an; danach haben beide `friend.handle` und keine offenen Anfragen.
    - C schickt an A und bekommt „anton ist schon mit jemandem verbunden.“
    - A schickt an sich selbst und bekommt „Das bist du selbst.“
    - A schickt zwei Anfragen an verschiedene Personen; die zweite scheitert mit „Du hast schon eine offene Anfrage.“
    - Schicken sich A und B gegenseitig eine Anfrage, ist die Freundschaft automatisch angenommen.
  - **Rechte:**
    - C (`asUser`) sieht per `select * from friendships` keine Zeile von A und B.
    - C kann `insert into friendships` nicht ausführen (permission denied).
  - **Ablehnen und Name:**
    - Ablehnen löscht die Anfrage.
    - `set_my_handle` scheitert, solange die Freundschaft angenommen ist.
- [ ] **Step 3: `npm run test:db -- friendships` → FAIL.**
- [ ] **Step 4: Write `drizzle/0012_friendships.sql`** (Statements getrennt mit `--> statement-breakpoint`, Stil wie `0010_pending_receipts.sql`), dazu Journal und Snapshot.
- [ ] **Step 5: `npm run test:db -- friendships` → PASS.**
- [ ] **Step 6: Write `scripts/apply-0012-friendships.mjs`.** Muster `apply-0010`:
  - `--dry-run` spielt in einer Transaktion ein, prüft und macht ROLLBACK.
  - Geprüft werden `has_table_privilege` für beide Tabellen und `has_function_privilege('authenticated', 'send_friend_request(text)', 'EXECUTE')`.
  - Zum Schluss `NOTIFY pgrst, 'reload schema'`.
- [ ] **Step 7: Run `node scripts/apply-0012-friendships.mjs --dry-run` → Ausgabe aller Prüfungen `true`, „ROLLBACK“.** Nicht ohne `--dry-run` ausführen, das passiert erst in Task 8.
- [ ] **Step 8: Commit:** `feat(db): Kontonamen und Freundschaften (Migration 0012, RPCs, DB-Tests)`

---

### Task 3: Teilungen (DB, Web)

**Files:**
- Create: `drizzle/0013_shared_purchases.sql` + Journal/Snapshot, `scripts/apply-0013-shared-purchases.mjs`, `tests/db/sharing.db.test.ts`
- Modify: `drizzle/0012`, nur falls `end_friendship` per `CREATE OR REPLACE` in 0013 erweitert wird (bevorzugt: in 0013 ersetzen)

**Interfaces:**
- Consumes: Freundschafts-RPCs aus Task 2, Typen `ShareItem` und `SharedPurchase` aus Task 1.
- **Tabelle `shared_purchases`:**
  - Spalten: `id uuid PK`, `creator_id uuid NOT NULL`, `partner_id uuid NOT NULL` (beide `REFERENCES auth.users ON DELETE CASCADE`), `creator_expense_id integer NOT NULL`, `partner_expense_id integer NOT NULL`, `description text`, `expense_date text`, `category text`.
  - Geld und Modus: `total numeric(12,2) NOT NULL`, `mode text CHECK IN ('percent','amount','items')`, `partner_percent numeric`, `partner_amount numeric(12,2) NOT NULL`, `items jsonb NOT NULL DEFAULT '[]'`.
  - Verwaltung: `updated_by uuid`, `updated_at timestamptz`, `creator_seen_at timestamptz`, `partner_seen_at timestamptz`.
  - RLS: SELECT, wenn `auth.uid()` creator oder partner ist. Keine Schreib-Policies.
- **Neue Spalten in `expenses`:**
  - `shared_purchase_id uuid REFERENCES shared_purchases(id) ON DELETE SET NULL`
  - `share_total numeric(12,2)`, `share_mode text`
  - `share_note text`: beim creator „Geteilt mit <handle>“, beim partner „Von <handle> geteilt“
- **Neue Spalten in `receipt_items`:** `shared_purchase_id uuid REFERENCES shared_purchases(id) ON DELETE SET NULL`, `shared_away boolean NOT NULL DEFAULT false`.
  - Die FKs sind eine bewusste Ausnahme von der Konvention „keine FKs“. Nur so werden Kopien beim Löschen eines Kontos sicher abgelöst.
- **RPCs** (`SECURITY DEFINER`; Advisory-Locks wie Task 2 und `SELECT … FOR UPDATE` auf `shared_purchases`):
  - `save_share(p_expense_id integer, p_mode text, p_partner_percent numeric, p_partner_amount numeric, p_items jsonb) RETURNS uuid`
    - **Berechtigung:** Der Aufrufer muss Eigentümer von `p_expense_id` sein.
    - **Bestehende Teilung:** Hat die Ausgabe schon `shared_purchase_id`, wird diese Teilung aktualisiert. Erlaubt ist das nur, solange creator und partner noch angenommen befreundet sind, sonst kommt „Ihr seid nicht mehr verbunden.“
    - **Neue Teilung:** Sonst wird neu angelegt: creator = Aufrufer, partner = sein Freund (sonst „Du hast noch keinen Freund verknüpft.“). `total` = Betrag der Ausgabe.
    - **Nicht teilbar** (Global Constraints) ergibt „Diese Buchung kann nicht geteilt werden.“
    - **Partner-Cent:** `round(total_cents * pct / 100)` bzw. `round(p_partner_amount * 100)` bzw. die Summe der Artikel mit `owner = 'partner'`. Außerhalb `0..total` kommt die Meldung aus Task 1.
    - **Ausgaben:** Die creator-Ausgabe bekommt `amount = (total - partner)/100` und `share_*`. Die partner-Ausgabe wird angelegt bzw. aktualisiert (gleiche `description`, `expense_date`, `category`, `share_*`, `user_id = partner`).
    - **Artikel bei `items`:**
      - Die Partner-Kopien in `receipt_items` werden ersetzt: alle Zeilen mit `shared_purchase_id = id AND user_id = partner_id` löschen, die Artikel mit `owner = 'partner'` mit `source = 'shared'` einfügen.
      - Bei Server-Artikeln des creators (`key` ist eine Zahl, die zu `creator_expense_id` gehört) wird `shared_away = (owner = 'partner')` und `shared_purchase_id` gesetzt.
    - **Bei anderen Modi** werden die Partner-Kopien gelöscht und `shared_away` beim creator auf `false` gesetzt.
    - **Verwaltung:** `updated_by` und `updated_at` setzen, `*_seen_at` des Aufrufers auf `now()`.
  - `unshare(p_id uuid) RETURNS void`:
    - Darf jedes Mitglied aufrufen, solange beide verbunden sind.
    - Die creator-Ausgabe bekommt `amount = total`, die `share_*`-Felder werden `NULL`, ihre Artikel `shared_away = false`.
    - Die partner-Ausgabe und die Partner-Artikel werden gelöscht, danach die Zeile `shared_purchases`.
  - `delete_shared(p_id uuid) RETURNS void`: löscht beide Ausgaben, alle `receipt_items` beider Ausgaben und die Zeile.
  - `mark_shares_seen() RETURNS void`
  - Erweitert werden:
    - `get_friend_state().unseenShares`: Anzahl der Teilungen, in denen ich Mitglied bin, `updated_by <> me` gilt und `updated_at > coalesce(my_seen_at, '-infinity')` ist.
    - `end_friendship()`: löst alle Teilungen. Bei beiden Ausgaben wird `shared_purchase_id = NULL` gesetzt, `share_note` und `share_total` bleiben. Die Zeilen in `shared_purchases` werden gelöscht.

- [ ] **Step 1: Failing tests in `sharing.db.test.ts`.** Setup: A (`anton`) und B (`lena`) sind befreundet. A hat eine Ausgabe REWE, 19,48, mit 8 Artikeln in `receipt_items`, wie im Entwurf.
  - **Prozent:** `save_share(..., 'percent', 50, null, null)` ergibt: A-Ausgabe 9,74, B hat eine Ausgabe 9,74 mit `share_note = 'Von anton geteilt'`, A hat `share_note = 'Geteilt mit lena'`.
  - **Artikel:**
    - Ist die Partner-Summe 9,52, hat A 9,96 und B 9,52.
    - B hat 4 `receipt_items` mit `source = 'shared'`.
    - Bei A haben 4 Artikel `shared_away = true`.
  - **Schlüssel `local:-5`:** Ein Artikel mit Schlüssel `local:-5` und `owner = 'partner'` landet als Kopie bei B. Bei A wird dafür nichts geändert.
  - **Änderung durch B:**
    - B ruft `save_share` mit B's Ausgaben-ID und `percent 30` auf. Danach haben beide Ausgaben neue Beträge (A 13,64, B 5,84).
    - `updated_by` ist B, und für A gilt `unseenShares = 1`.
    - Nach `mark_shares_seen()` von A gilt `unseenShares = 0`.
  - **Aufheben und Löschen:**
    - `unshare`: A-Ausgabe 19,48 ohne Hinweis, B-Ausgabe und B-Artikel weg.
    - `delete_shared`: beide Ausgaben weg.
  - **Fehlerfälle:**
    - Teilen ohne Freund ergibt „Du hast noch keinen Freund verknüpft.“
    - Eine Ausgabe mit `account_id` ergibt „Diese Buchung kann nicht geteilt werden.“
    - Partner-Artikel mit Summe 25,00 ergeben die Meldung „mehr als den Gesamtbetrag“.
    - Ein Partner-Artikel mit −0,25 senkt den Partner-Anteil.
  - **Rechte:**
    - C sieht keine `shared_purchases` von A und B.
    - `save_share` mit A's Ausgaben-ID als C ergibt einen Fehler.
  - **Trennen und Konto löschen:**
    - `end_friendship` als B: Beide Ausgaben bleiben, `shared_purchase_id IS NULL`, `share_note` ist noch gesetzt.
    - `delete from auth.users where id = A` (`asAdmin`): Die B-Ausgabe bleibt mit `shared_purchase_id IS NULL`.
  - **Gleichzeitigkeit:** Zwei aufeinanderfolgende `save_share` von A und B in derselben Transaktion; der Endstand entspricht dem letzten Aufruf. Die echte Gleichzeitigkeit sichern `FOR UPDATE` und der Advisory-Lock: dazu im Code-Review prüfen.
- [ ] **Step 2: `npm run test:db -- sharing` → FAIL.**
- [ ] **Step 3: Write `drizzle/0013_shared_purchases.sql`** + Journal und Snapshot. Die Funktionen werden in PL/pgSQL geschrieben und rechnen intern in Cent.
- [ ] **Step 4: `npm run test:db` (beide Dateien) → PASS.**
- [ ] **Step 5: Write `scripts/apply-0013-shared-purchases.mjs`** und `--dry-run` ausführen → alle Prüfungen `true`, „ROLLBACK“.
- [ ] **Step 6: Commit:** `feat(db): Teilungen mit Artikel-Kopien und RPCs (Migration 0013, DB-Tests)`

---

### Task 4: Typen, API-Hülle, Server Actions, Schutz für geteilte Ausgaben (Web)

**Files:**
- Create: `utils/sharing/api.ts`, `app/actions/sharing.ts`, `utils/sharing/api.test.ts`
- Modify: `src/db/schema.ts` (neue Tabellen und Spalten wie in 0012/0013), `app/types.ts`
  - `Expense` bekommt `shared_purchase_id: string | null`, `share_total: number | null`, `share_mode: ShareMode | null`, `share_note: string | null`.
  - `ReceiptItem` bekommt `shared_purchase_id`, `shared_away`.
- Modify: `app/actions.ts`: Schutz in `updateExpense` und `deleteExpense`
- Modify: `utils/sharing/display.ts`: Ersatztyp aus Task 1 durch `Expense` ersetzen

**Interfaces:**
- **API-Hülle** (`api.ts`): Alle Funktionen nehmen `sb: SupabaseClient` als ersten Parameter und werfen `Error` mit der deutschen DB-Meldung, also `error.message` ohne Präfix.
  - Freundschaft: `getFriendState(sb): Promise<FriendState>`, `setHandle(sb, handle: string): Promise<string>`, `sendFriendRequest(sb, handle): Promise<FriendState>`, `cancelFriendRequest(sb)`, `respondFriendRequest(sb, id: string, accept: boolean)`, `endFriendship(sb)`. Die vier letzten geben `Promise<FriendState>` zurück.
  - Teilung: `saveShare(sb, input: SaveShareInput): Promise<string>`, `unshare(sb, id: string): Promise<void>`, `deleteShared(sb, id: string): Promise<void>`, `markSharesSeen(sb): Promise<void>`.
  - Lesen: `getSharedPurchase(sb, id: string): Promise<SharedPurchase>` per `select` auf `shared_purchases` (RLS).
- **Server Actions** (`app/actions/sharing.ts`, `'use server'`): eine Action pro API-Funktion mit dem Präfix `act`, z. B. `actSaveShare(input)`.
  - Sie nutzen `createClient()` aus `utils/supabase/server.ts`, geben `{ ok: true, data } | { ok: false, error: string }` zurück und rufen nach Schreibzugriffen `revalidatePath('/')` auf.
- **Schutz in `app/actions.ts`:**
  - `deleteExpense(id)`: Hat die Ausgabe `shared_purchase_id`, wird nichts gelöscht und `{ error: 'Geteilte Ausgabe – bitte über „Für beide löschen“ entfernen.' }` zurückgegeben.
  - `updateExpense(id, formData)`: Bei einer geteilten Ausgabe sind Betrag und Datum gesperrt, dieselbe Art Meldung „Geteilte Ausgabe – Betrag über „Teilung ändern“ anpassen.“. Beschreibung und Kategorie bleiben erlaubt.
  - Die Rückgabe ist neu. Aufrufer, die heute nichts auswerten, zeigen die Meldung per `alert` (Muster wie `AddExpenseForm`).

- [ ] **Step 1: Failing test `api.test.ts`.**
  - Ein Fake-Client, dessen `rpc(name, args)` Name und Argumente aufzeichnet.
  - `saveShare(sb, {expenseId: 7, mode: 'items', items})` ruft `rpc('save_share', { p_expense_id: 7, p_mode: 'items', p_partner_percent: null, p_partner_amount: null, p_items: items })` auf.
  - Ein RPC-Fehler `{ message: 'Das bist du selbst.' }` wird zu `Error('Das bist du selbst.')`.
- [ ] **Step 2: Failing test für den Schutz.** Neue reine Hilfsfunktion `sharedExpenseGuard(e: Pick<Expense,'shared_purchase_id'>, op: 'delete' | 'update-amount'): string | null` in `utils/sharing/display.ts`; `app/actions.ts` nutzt sie.
  - Nicht geteilte Ausgaben ergeben `null`, geteilte die genauen Meldungen oben.
- [ ] **Step 3: `npm run test -- utils/sharing` → FAIL.**
- [ ] **Step 4: Implement** Schema, Typen, `api.ts`, `sharing.ts`, `sharedExpenseGuard` und den Schutz in `app/actions.ts`.
- [ ] **Step 5: `npm run test` und `npx tsc --noEmit` → PASS, keine Typfehler.**
- [ ] **Step 6: Commit:** `feat(sharing): API-Hülle, Server Actions und Schutz geteilter Ausgaben`

---

### Task 5: Verknüpfen, Brief, Banner (Web-UI, A3 + B4)

**Files:**
- Create: `components/sharing/Dove.tsx`, `components/sharing/FriendLinkView.tsx`, `components/sharing/FriendRequestLetter.tsx`, `components/sharing/SharesChangedBanner.tsx`
- Modify: `app/globals.css` (`--color-partner` je Theme, Keyframes `dove-fly`, `dove-flap`, `letter-open`, `item-swim-r`, `item-swim-l`, Fallback für reduzierte Bewegung), `components/SettingsOverlay.tsx`, `components/MobileDashboard.tsx`
- Test: `e2e/sharing.spec.ts` (Anfang, wird in Task 7 vervollständigt)

**Interfaces:**
- Consumes: `act*`-Actions aus Task 4.
- **Produces:**
  - `<Dove flying: boolean; path: 'line' />`: Das SVG und die Flugbahn sind aus dem Entwurf A3 übernommen (Taube mit Brief im Schnabel, Flügelschlag 0,2 s, Flug 2,4 s entlang der Linie und dann aus dem Bild).
  - `<FriendLinkView state: FriendState; onChange(state) />`
  - `<FriendRequestLetter request: FriendState['incoming'][0]; onAnswer(accept: boolean) />`
  - `<SharesChangedBanner count: number; friendHandle: string; onOpen() />`
- **Verhalten:**
  - **Ohne Kontonamen:** `FriendLinkView` zeigt zuerst das Feld „Dein Kontoname“.
  - **Senden:** Der Knopf „Verbinden“ startet die Taube **sofort** und schickt parallel `actSendFriendRequest`. Bei einem Fehler landet die Taube nicht. Der Fehlertext erscheint unter dem Feld, und der Status bleibt „Noch nicht verbunden“.
  - **Status-Texte:** „Noch nicht verbunden“, „Anfrage gesendet · wartet auf <handle>“ (Knopf „Anfrage zurückziehen“), „Verbunden mit <handle>“ (Knopf „Verbindung trennen“ mit Rückfrage).
  - **Startabfrage:** `MobileDashboard` ruft beim Start (nach dem Laden der Daten) `actGetFriendState` auf.
    - Bei `incoming.length > 0` erscheint `FriendRequestLetter` als Vollbild (B4: Brief antippen, Klappe öffnet, Knöpfe „Annehmen & verbinden“ und „Ablehnen“).
    - Bei `unseenShares > 0` erscheint das Banner „<handle> hat <n> geteilte Ausgabe(n) eingetragen oder geändert“. Tippen öffnet den Verlauf und ruft `actMarkSharesSeen` auf.
  - **Einstieg:** in `SettingsOverlay` ein neuer Eintrag „Gemeinsam teilen“, der `FriendLinkView` öffnet.

- [ ] **Step 1: E2E-Test `e2e/sharing.spec.ts`.**
  - Zwei Konten über `TEST_EMAIL/TEST_PASSWORD` und `TEST2_EMAIL/TEST2_PASSWORD`; ohne diese Werte wird übersprungen, wie `main-flow.spec.ts`.
  - Testfall `'Anfrage senden, Taube fliegt, Empfänger sieht Brief und nimmt an'`:
    - Konto 1 setzt den Namen und schickt eine Anfrage an den Namen von Konto 2. `[data-testid="dove"]` ist sichtbar und danach nicht mehr sichtbar.
    - Konto 2 meldet sich in einem zweiten `browser.newContext()` an und sieht den Text „hat dir eine Taube geschickt“. Es tippt den Brief an und klickt „Annehmen & verbinden“.
    - Konto 1 sieht nach dem Neuladen „Verbunden mit“.
    - Zum Schluss in `afterAll` per API `actEndFriendship` aufräumen.
- [ ] **Step 2: `npx playwright test e2e/sharing.spec.ts` → FAIL** (bzw. SKIP ohne Testkonten; dann den Nutzer nach zwei Testkonten fragen, bevor Task 7 beginnt).
- [ ] **Step 3: Implement** die Komponenten, CSS und Einstiege.
- [ ] **Step 4: Prüfen.**
  - `npm run lint`, `npm run test`, Playwright → PASS.
  - Visuell im Browser-Pane (mobile 375×812): Taube fliegt, Brief öffnet. Mit `prefers-reduced-motion` gibt es nur eine Überblendung.
- [ ] **Step 5: Commit:** `feat(sharing): Freund verknüpfen mit Taube, Brief und Hinweis-Banner`

---

### Task 6: Teilen, Artikel verteilen, Verlauf (Web-UI, C4 + D1-Final + E1)

**Files:**
- Create: `components/sharing/ShareSheet.tsx`, `components/sharing/ItemSplitBoard.tsx`, `components/sharing/ShareBadge.tsx`
- Modify: `components/dashboard/HistoryView.tsx`, `components/MobileDashboard.tsx` (Bearbeiten und Löschen leiten bei geteilten Ausgaben um), `components/AddExpenseForm.tsx`, `components/receipt/ReceiptScanView.tsx`, die Artikel-Auswertung (`components/analysis/BasketTab.tsx` und alle Stellen, die `receipt_items` summieren: `grep -rn "receipt_items\|receiptItems" components utils`)

**Interfaces:**
- Consumes: `split.ts` und `display.ts` (Task 1), `act*`-Actions (Task 4), `--color-partner` und Keyframes (Task 5).
- **Produces:**
  - `<ShareSheet expense: Expense; items: ReceiptItem[]; friend: { handle: string }; onClose(); onSaved() />`
  - `<ItemSplitBoard items: ShareItem[]; meName: string; friendName: string; onChange(items: ShareItem[]) />`
  - `<ShareBadge expense: Expense />`
- **`ShareSheet` (C4)** ist ein Fenster von unten:
  - Titel „<Beschreibung> teilen“ bzw. „… Teilung ändern“.
  - Ein Balken mit verschiebbarer Grenze (`input type=range`, 0–100, Schritt 1, Start 50 bzw. der gespeicherte Wert). Die Beträge stehen in den beiden Farbflächen.
  - Knöpfe „Betrag eingeben“ (zwei Felder, das andere rechnet den Rest) und „Nach Artikeln“. Letzterer ist nur aktiv, wenn es Artikel gibt.
  - Hauptknopf „Teilung speichern“.
  - Bei geteilten Ausgaben zusätzlich „Teilung aufheben“ und „Für beide löschen“, je mit `confirm`.
  - Fehler aus der Action werden als Text im Fenster gezeigt.
  - Artikel der Ausgabe für den creator: bei bestehender Teilung `SharedPurchase.items` (über `getSharedPurchase`), sonst `initialItems(receiptItems)` mit `key = String(id)`.
- **`ItemSplitBoard` (D1-Final):**
  - Zwei Spalten mit Kopf (Name und Summe live über `partnerCentsForItems`). Anfangs liegt alles auf der creator-Seite.
  - Antippen führt `toggleOwner` aus. Der Artikel wird ans Ende der Zielspalte gehängt und läuft mit `item-swim-r` / `item-swim-l` (0,9 s, wellige Bahn wie im Entwurf).
  - Leere Partnerspalte: gestrichelter Platzhalter „Tippe links einen Artikel – er schwimmt zu <name>“.
  - Knopf „Alle zu mir“ setzt alles auf creator zurück.
  - Sieht der Partner die Teilung, steht seine eigene Spalte links. Die Daten bleiben gleich, nur die Darstellung ist gespiegelt.
- **Einstiege:**
  - **Verlauf:** In `HistoryView` bekommt der aufgeklappte Eintrag einen Knopf „Teilen“ bzw. „Teilung ändern“, nur wenn `isSpendingExpense(e)` gilt und ein Freund verknüpft ist.
  - **Eintragen und Kassenbon:** In `AddExpenseForm` und beim Speichern eines Bons gibt es einen Schalter „Mit <handle> teilen“, nur mit Freund. Nach dem Speichern öffnet sich `ShareSheet` für die neue Ausgabe.
  - **Zeile im Verlauf (E1):**
    - `ShareBadge` zeigt `shareBadgeText(e)` als Pille in `bg-partner/15 text-partner`.
    - Der Betrag der Zeile bleibt der eigene Anteil, darunter steht klein `shareSubline(e)`.
- **Analyse:** Artikel mit `shared_away = true` zählen in keiner Artikel-Auswertung und erscheinen nicht in der Artikelliste der Ausgabe.

- [ ] **Step 1: E2E erweitern um `'Bon nach Artikeln teilen, beide sehen nur ihren Anteil'`.**
  - Konto 1 legt eine Ausgabe „E2E-Teilen“ über 19,48 an. Die Artikel kommen per Hilfsfunktion als `receipt_items` über die Server Action des Bon-Speicherns oder per Supabase-Client im Test.
  - Konto 1 öffnet „Teilen“ → „Nach Artikeln“, tippt 4 Artikel an und speichert.
  - Konto 1 sieht 9,96 € und „Geteilt mit <name2> · Artikel“.
  - Konto 2 sieht nach dem Neuladen 9,52 €, „Von <name1> geteilt · Artikel“ und genau 4 Artikel.
  - Danach „Für beide löschen“; bei beiden ist die Ausgabe verschwunden.
- [ ] **Step 2: Failing Unit-Tests.**
  - Für jede geänderte Artikel-Auswertung ein Test, dass `shared_away`-Artikel nicht mitzählen. Ort ist die jeweilige vorhandene Testdatei; wo keine existiert, die reine Summenfunktion herausziehen und testen.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Prüfen.** `npm run lint`, `npm run test`, `npm run build`, Playwright → PASS; visuell im Browser-Pane: Schwimmen läuft flüssig, Balken lässt sich ziehen.
- [ ] **Step 5: Commit:** `feat(sharing): Teilen nach Betrag und Artikeln, Hinweis im Verlauf`

---

### Task 7: Web-Gesamtprüfung

**Files:** keine neuen. Gegebenenfalls Korrekturen in den Dateien aus Task 5 und 6.

- [ ] **Step 1: Run.** `npm run test`, `npm run test:db`, `npm run lint`, `npm run build`, `npx playwright test` → alles PASS. `test:db` läuft gegen die Datenbank mit ROLLBACK, Migrationen nur in der Transaktion.
- [ ] **Step 2: Manuell im Browser-Pane mit zwei Testkonten.**
  - Ablauf: Anfrage, annehmen, nach Betrag teilen, B ändert auf 30 %.
  - A sieht das Banner, und die Beträge stimmen.
  - A trennt die Verbindung; die Ausgaben bleiben mit Hinweis.
  - Gemacht in der Gesamtprüfung mit `superpowers:requesting-code-review`.
- [ ] **Step 3: Commit** der Korrekturen: `fix(sharing): Befunde aus der Gesamtprüfung`

---

### Task 8: Migrationen live einspielen (nur nach OK des Nutzers)

**Files:** keine.

- [ ] **Step 1: Den Nutzer fragen.** „Migration 0012 und 0013 jetzt in die Live-Datenbank einspielen?“ Ohne ausdrückliches Ja ist hier Schluss.
- [ ] **Step 2: Einspielen.** `node scripts/apply-0012-friendships.mjs`, danach `node scripts/apply-0013-shared-purchases.mjs`, bei Bedarf mit `POOLER_HOST=aws-1-eu-west-1.pooler.supabase.com`. Erwartet: alle Prüfungen `true`, „COMMIT“.
- [ ] **Step 3: Prüfen.** `node scripts/check-migration-state.mjs` bzw. eine kurze Abfrage `select to_regclass('public.shared_purchases')` → nicht `NULL`.
- [ ] **Step 4: Dokumentieren.** Eintrag in `plaene/UEBERSICHT.md` (Status), committen: `docs(plaene): Migrationen 0012/0013 live`

---

### Task 9: Handy-App, Daten und Abgleich

Repo `C:\Anton\Cashflow-AndroidApp`, Branch `feature/geteilte-einkaeufe`. Erst beginnen, wenn Task 8 erledigt ist.

**Files:**
- Copy: `utils/sharing/{types,split,display,api}.ts` und ihre Tests aus dem Web-Repo, unverändert.
- Modify: `app/types.ts` (Felder wie Web Task 4), `utils/localdb.ts`
  - Neue Dexie-Version 8, ohne neue Indizes.
  - Kommentar: Die Felder `share_*`/`shared_purchase_id` in `expenses` und `shared_away`/`shared_purchase_id` in `receipt_items` kommen über den Pull. Die Handy-App schreibt sie nie selbst hoch; Ausnahme ist `shared_away` lokal, das bei `receipt_items` ohnehin nicht hochgeladen wird.
- Create: `utils/sharingSync.ts`, `utils/sharingSync.test.ts`
- Modify: `utils/autoSync.ts` bzw. `utils/sync.ts`: nach jedem erfolgreichen Abgleich `refreshSharing()`
- Modify: `components/MobileDashboard.tsx`: `updateExpenseLocal` und `deleteExpenseLocal` nutzen `sharedExpenseGuard`
- Modify: die Artikel-Auswertungen (`utils/basketAnalysis.ts`, `utils/basketStore.ts` und weitere Fundstellen von `receipt_items`): `shared_away` ausblenden

**Interfaces:**
- Consumes: `api.ts` (Task 4), aufgerufen mit `supabaseRemote` in `withNetwork(...)`.
- **Produces:**
  - `applySharedItemFlags(localItems: ReceiptItem[], purchase: SharedPurchase, myUserId: string): { id: number; shared_away: boolean; shared_purchase_id: string | null }[]`: rein. Für jeden Artikel mit `key` `local:<id>` (bzw. `<id>`) des **eigenen** Ausgaben-Bons als creator wird `shared_away = owner === 'partner'` gesetzt. Ist man selbst partner, ergibt das eine leere Liste.
  - `refreshSharing(): Promise<{ state: FriendState; unseen: number } | null>`:
    - nur mit Sync-Anmeldung und Netz, sonst `null`
    - lädt `getFriendState` und alle `shared_purchases` der lokalen Ausgaben mit `shared_purchase_id`
    - schreibt die Merker in Dexie
    - speichert den State in `_meta` unter `sharingState`, damit offline der letzte Name sichtbar bleibt
  - `shareFromPhone(input: SaveShareInput & { localExpenseId: number }): Promise<string>`:
    1. Hat die Ausgabe eine negative ID, zuerst `syncNow()` aufrufen und die echte ID aus Dexie lesen.
    2. Bei Artikeln den Schlüssel `local:<id>` für lokale Artikel mitschicken.
    3. `saveShare` aufrufen.
    4. Lokale Artikel-Merker sofort per `applySharedItemFlags` setzen.
    5. `syncNow()`, damit beide Beträge zurückkommen.
  - **Aufräumen:** Wird eine Ausgabe remote gelöscht (`delete_shared`), müssen ihre lokalen Artikel weg. Prüfen, ob `receiptItemsPrune` das schon erledigt; sonst dort ergänzen und testen.

- [ ] **Step 1: Copy-Tests aus dem Web laufen lassen.** `npm run test -- utils/sharing` → PASS.
- [ ] **Step 2: Failing tests in `utils/sharingSync.test.ts`.**
  - `applySharedItemFlags`: creator mit Schlüsseln `local:-3` (partner) und `local:-4` (creator) ergibt `[{id:-3, shared_away:true, …}, {id:-4, shared_away:false, …}]`.
  - Als partner kommt `[]` heraus.
  - `refreshSharing` mit gesperrtem Netz (ohne `withNetwork`) gibt `null` zurück und macht keinen Netzaufruf. Prüfung über `getBlockedAttempts()` aus `networkGate`.
  - Der Schutz in `deleteExpenseLocal` und `updateExpenseLocal` greift für geteilte Ausgaben: gleiche Meldungen wie Web.
  - Die Artikel-Auswertungen ignorieren `shared_away`.
  - Ein remote gelöschter geteilter Bon hinterlässt keine lokalen Artikel.
- [ ] **Step 3: `npm run test` → FAIL.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: `npm run test`, `npx tsc --noEmit`, `npm run build` → PASS.** Dazu gehört `utils/networkAudit.test.ts`: Der neue Code macht keine Netzaufrufe außerhalb von `withNetwork`.
- [ ] **Step 6: Commit** (Handy-Repo): `feat(sharing): Teilungs-Abgleich und lokale Artikel-Merker`

---

### Task 10: Handy-App, Oberfläche

**Files:**
- Copy and adapt: `components/sharing/*` aus dem Web.
  - **Statt Server Actions:** Aufrufe über `api.ts` mit `supabaseRemote` in `withNetwork`, danach `syncNow()`.
  - **Online-Sperre:** Offline oder ohne Sync-Anmeldung sind alle Teilen- und Verknüpfen-Knöpfe deaktiviert und zeigen „Teilen braucht Internet“. Ohne Anmeldung erscheint zusätzlich der Hinweis auf die Anmeldung über `SyncLoginDialog`.
- Modify: `components/SettingsOverlay.tsx` (Eintrag „Gemeinsam teilen“), `components/MobileDashboard.tsx` (nach `refreshSharing`: Brief bei `incoming`, Banner bei `unseen`), der Verlauf (Badge, „Teilen“), `components/AddExpenseForm.tsx` und `components/ReceiptScanView.tsx` (Schalter „Mit <handle> teilen“)
- Modify: `app/globals.css`: dieselben Variablen und Keyframes wie Web Task 5

**Interfaces:**
- Consumes: Task 9 (`refreshSharing`, `shareFromPhone`, `sharingState` in `_meta`), dazu die Komponenten-Props wie Web Task 5 und 6.

- [ ] **Step 1: Failing Komponententest** (falls die Handy-App Komponententests hat, sonst ein reiner Test der Sperrlogik).
  - Neue Funktion `sharingAvailability({ online, signedIn, hasFriend }): 'ok' | 'offline' | 'signin' | 'nofriend'` in `utils/sharingSync.ts`.
  - Der Test deckt alle vier Fälle ab.
- [ ] **Step 2: `npm run test` → FAIL**, dann implementieren, danach PASS.
- [ ] **Step 3: Visuell prüfen.** Browser-Pane mit `npm run dev`, mobile Ansicht: Taube, Brief, Schwimmen und Offline-Text, Letzteres durch Abschalten des Netzes in den DevTools bzw. ohne Anmeldung.
- [ ] **Step 4: `npm run build` → PASS.**
- [ ] **Step 5: Commit** (Handy-Repo): `feat(sharing): Verknüpfen, Teilen und Hinweise in der Handy-App`

---

### Task 11: Ausliefern und Übersicht

- [ ] **Step 1: Den Nutzer fragen.** „Web-App per /push-web-app und Handy-App per /push-local-app ausliefern?“ Nur nach Ja weitermachen.
- [ ] **Step 2: Web ausliefern.** Erst den Branch in `main` bringen (PR oder Merge nach Wahl des Nutzers), dann `/push-web-app`.
- [ ] **Step 3: Handy ausliefern.** Branch `feature/geteilte-einkaeufe` in den Hauptzweig des Handy-Repos mergen, dann `/push-local-app` (OTA, kein neues APK nötig).
- [ ] **Step 4: Abschlusstest live.** Zwei Testkonten, eines im Web, eines auf dem Handy, Ablauf wie Task 7 Step 2. Danach den Status in `plaene/UEBERSICHT.md` auf „ausgeführt“ setzen und committen.

---

## Nachtrag 2026-10-22: Freunde nur mit Kassenbon-Scan

Entscheidung des Nutzers: Nur wer für den Kassenbon-Scan freigeschaltet ist (`app_metadata.receipt_scan = true`), darf Freundschaften schließen, teilen und sieht die Anzeige dazu.

- **Anzeige (Web):** `MobileDashboard` ruft den Freundesstand nur mit Freischaltung ab; ohne sie fehlen Brief, Banner, Hinweis, Teilen-Schalter, „Teilen“ im Verlauf und der Einstellungs-Eintrag „Gemeinsam teilen“.
- **Server:** `app/actions/sharing.ts` prüft den Merker frisch beim Auth-Server. Die Datenbank prüft ihn zusätzlich (Migration `0014_friends_scan_only.sql`: `set_my_handle`, `send_friend_request`, `respond_friend_request`), weil die Handy-App die RPCs direkt aufruft. Ein Ziel-Konto ohne Scan gilt als „nicht gefunden“. Teilungen setzen eine Freundschaft voraus.
- **Abschalten:** `setReceiptScan` (Web-Admin und `chef-admin`) beendet Freundschaft und Teilungen (`endUserSharing`); die Ausgaben bleiben stehen.
- **Handy-App:** Die Oberfläche ist dort noch nicht ausgeblendet; ohne Freischaltung kommt die Meldung „Freunde sind für dein Konto nicht freigeschaltet.“ aus der Datenbank. Ausblenden in der Handy-App bleibt offen.
- **E2E:** `e2e/sharing.spec.ts` braucht Testkonten mit Scan-Freischaltung.
