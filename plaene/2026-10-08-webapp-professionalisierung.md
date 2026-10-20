# Plan: Webapp professionalisieren – Rechtliches, Demo mit Tour, Mehrfach-Einladungscodes

## Context

Die Web-App (melinasbudgetplaner.vercel.app) soll professioneller wirken und rechtlich sauber sein. Sie läuft **privat und kostenlos**: Konten gibt es nur per Einladungscode. Drei Bausteine:

1. **Rechtliches:** Bisher gibt es kein Impressum, keine Datenschutzerklärung und keinen Hinweis bei der Registrierung.
2. **Demo-Modus mit geführter Tour:** Man kann die App ohne Konto ausprobieren. Es gibt Beispieldaten, und eigene Eingaben bleiben **nur im localStorage** (bis „Demo zurücksetzen“). Die Demo hat **keinen Zugriff auf Supabase**. Eine Schritt-für-Schritt-Tour („Tippe hier, um eine Ausgabe einzutragen“) erklärt die App und lässt sich jederzeit abbrechen.
3. **Einladungscodes für mehrere Personen:** Ein Code gilt künftig für eine einstellbare Anzahl von Personen. Wer ihn eingelöst hat, wird angezeigt („3/5 genutzt“ plus E-Mails). Das gilt im Web-Admin und in der Chefansicht-Handy-App.

Empfohlene Reihenfolge: **Phase 1 → 2 → 3 → 4.** Jede Phase lässt sich einzeln ausliefern.

---

## Phase 1 – Rechtlicher Rahmen

### Was rechtlich nötig ist (privater, kostenloser Betrieb)
| Thema | Pflicht? | Begründung |
|---|---|---|
| **Datenschutzerklärung** | **Ja** | Die App verarbeitet personenbezogene Daten fremder Personen (E-Mail, Finanzdaten, optional Zugangsdaten zum Mail-Postfach für den REWE-Import). Damit greift die Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO) nicht mehr sicher, und die Infopflicht nach Art. 13 DSGVO gilt. |
| **Impressum** (§ 5 DDG) | Eigentlich nein (nicht geschäftsmäßig) | Wird trotzdem eingebaut: kostet nichts, wirkt seriös und deckt den Fall ab, dass die Demo öffentlich erreichbar ist. |
| **Cookie-Banner** | **Nein** | Es gibt nur technisch notwendige Speicherung (Supabase-Session-Cookie, `theme`, Demo-Daten). Das ist nach § 25 Abs. 2 TDDDG einwilligungsfrei, solange kein Tracking und keine Analytics dazukommen. |
| **Häkchen bei Registrierung** | Empfohlen | Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Nutzung des Dienstes), **keine Einwilligung**. Deshalb lautet der Text „zur Kenntnis genommen“ statt „willige ein“. Es dient als Nachweis. |
| **Haftungsausschluss** | Empfohlen | „Keine Finanz- oder Steuerberatung, Berechnungen ohne Gewähr“. Kurzer Abschnitt im Impressum. |
| **Konto löschen (Art. 17)** | Recht muss erfüllbar sein | Per E-Mail-Anfrage genügt. Ein Knopf „Konto löschen“ ist optional (siehe Phase 1e). |

> Hinweis: Das ist keine Rechtsberatung. Den Text am Ende einmal mit einem Generator abgleichen (z. B. Datenschutz-Generator von Dr. Schwenke oder eRecht24).

### 1a. Betreiberdaten an einer Stelle
- Neu: `lib/legal/operator.ts` mit Name, Anschrift, E-Mail und `PRIVACY_VERSION = '2026-10'`.
- **Du musst die echten Daten eintragen.** Bis dahin stehen dort deutlich sichtbare Platzhalter.

### 1b. Seiten `app/impressum/page.tsx` und `app/datenschutz/page.tsx`
- Statische Server Components ohne Login, Tailwind und Theme-Variablen wie in `DESIGN.md`, mit Zurück-Link.
- Die **Datenschutzerklärung** enthält:
  - Verantwortlicher
  - Verarbeitete Daten: Konto (E-Mail, Passwort-Hash), Finanzeinträge, Bon-Artikel, optional IMAP-Zugangsdaten und REWE-Bon-Mails
  - Zwecke und Rechtsgrundlagen (Art. 6 Abs. 1 lit. b und f)
  - Auftragsverarbeiter:
    - **Supabase** (Datenbank/Auth; die Region im Dashboard prüfen und eintragen)
    - **Vercel** (Hosting; USA, EU-US Data Privacy Framework/SCC)
  - Speicherdauer (bis zur Kontolöschung)
  - Lokale Speicherung im Browser (Session, Theme, Demo)
  - Kein Tracking, kein Profiling
  - Betroffenenrechte (Art. 15–21) und Beschwerderecht bei der Aufsichtsbehörde
  - Stand bzw. Version
- Wichtig: `middleware.ts` so anpassen, dass `/impressum`, `/datenschutz` und `/demo` vom Matcher **ausgenommen** sind. Dann läuft dort kein `supabase.auth.getUser()`.

### 1c. Links überall, wo man sie erwartet
- Im Footer von `components/LoginScreen.tsx`: „Impressum · Datenschutz“, in allen drei Modi.
- In `components/SettingsOverlay.tsx`: neuer Abschnitt „Rechtliches“ am Ende des Hauptmenüs.
- Im Demo-Banner (Phase 3).

### 1d. Häkchen bei der Registrierung
- `LoginScreen.tsx`, nur im Modus Registrierung: Pflicht-Checkbox „Ich habe die [Datenschutzerklärung] zur Kenntnis genommen.“ Ohne Häkchen ist der Button deaktiviert.
- `app/actions/auth.ts` → `signUpWithInviteCode(..., privacyAccepted: boolean)`:
  - Prüft das Häkchen **serverseitig** und lehnt ohne Häkchen ab.
  - Speichert `user_metadata: { privacy_accepted_at, privacy_version }` bei `auth.admin.createUser`. So braucht es keine neue Tabelle.
- Bestandsnutzer: In `app/page.tsx` nach dem Login prüfen, ob `user_metadata.privacy_version` fehlt oder veraltet ist. Dann einmalig ein Hinweis-Dialog „Datenschutzhinweise aktualisiert“ mit Bestätigen-Knopf, der `supabase.auth.updateUser({ data: {...} })` aufruft. Das funktioniert auch bei späteren Änderungen.

### 1e. (Optional, empfohlen) „Konto löschen“ in den Einstellungen
- Neue Server Action: zuerst die Daten des Nutzers löschen, dann `auth.admin.deleteUser`.
- Die bestehende Logik `deleteUserData` aus `app/actions/admin.ts` wird wiederverwendet, aber für den eingeloggten Nutzer selbst.
- Doppelte Bestätigung. Vorher wird der vorhandene Backup-Export angeboten.

---

## Phase 2 – Einladungscodes für mehrere Personen

Heute (aus der Analyse):
- `invite_codes` hat `used_at` und `used_by`. Ein Code ist einmalig nutzbar.
- Der Code wird atomar über `update ... is('used_at', null)` beansprucht, in `app/actions/auth.ts:44-50`.
- Der Ablauf wird erst nach dem Beanspruchen geprüft (Grund: das `.or()`-Problem bei UPDATE, siehe Memory).

### 2a. Handgeschriebene Migration `drizzle/0007_invite_code_multi_use.sql`
Laut Memory nicht über `drizzle-kit generate/migrate`. Stattdessen ein Skript nach dem Muster `scripts/apply-0005-invite-codes.mjs`.
- `ALTER TABLE invite_codes ADD max_uses int NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100), ADD use_count int NOT NULL DEFAULT 0;`
- Bestehende Daten übernehmen: `use_count = 1` dort, wo `used_at IS NOT NULL`.
- Neue Tabelle `invite_code_redemptions`:
  - Spalten: `id serial PK`, `code_id int REFERENCES invite_codes(id) ON DELETE CASCADE`, `user_id uuid NOT NULL`, `redeemed_at timestamptz DEFAULT now()`, `UNIQUE(code_id, user_id)`
  - Bestehende Daten aus `used_by` übernehmen.
  - RLS an, **keine Policy**, Rechte nur für `service_role` (Tabelle und Sequenz), wie bei 0005.
- SQL-Funktion `claim_invite_code(p_code text) RETURNS TABLE(code_id int, status text)`:
  - Ein einziges atomares `UPDATE ... SET use_count = use_count + 1, used_at = CASE WHEN use_count + 1 >= max_uses THEN now() ELSE used_at END WHERE code = p_code AND use_count < max_uses AND (expires_at IS NULL OR expires_at > now()) RETURNING id`.
  - Trifft das UPDATE nichts, wird der Grund ermittelt: `invalid`, `exhausted` oder `expired`.
  - Damit sind Ablauf und Kontingent in **einem** Schritt geprüft. Das bisherige „erst beanspruchen, dann bei Ablauf zurücksetzen“ und das `.or()`-Problem entfallen.
- `release_invite_code(p_id int)`: `use_count = greatest(use_count - 1, 0), used_at = NULL`. Wird genutzt, wenn `createUser` fehlschlägt.
- Die beiden Funktionen bekommen `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`, danach `NOTIFY pgrst, 'reload schema';`.
- `used_at` bleibt als „ausgeschöpft am“ erhalten. Dadurch zeigt die **alte** Chefansicht-App auf dem Handy bis zum OTA-Update noch halbwegs richtige Status.

### 2b. Web-App
- `src/db/schema.ts` und `app/types.ts`: neue Spalten und die neue Tabelle (`InviteCode`, `InviteRedemption`).
- `utils/inviteCode.ts`: neue reine Funktion `inviteStatus(code, now)`. Sie liefert `open | exhausted | expired` sowie `remaining`. Dazu Vitest-Tests in `utils/inviteCode.test.ts`.
- `app/actions/auth.ts` → `signUpWithInviteCode`, neuer Ablauf:
  1. `rpc('claim_invite_code')`
  2. `createUser` (mit Datenschutz-Metadaten aus 1d); bei Fehler `rpc('release_invite_code')`
  3. Insert in `invite_code_redemptions`
  - Die Fehlermeldungen bleiben deutsch: „ungültig“, „bereits von allen Personen verwendet“, „abgelaufen“.
- `app/actions/inviteCodes.ts`:
  - `generateInviteCode(note, expiresInDays, maxUses)` prüft `maxUses` auf 1–100.
  - `listInviteCodes` und `getInviteCodeRedeemers` lesen aus `invite_code_redemptions` und geben pro Code eine Liste von E-Mail und Datum zurück.
- `components/admin/InviteCodePanel.tsx`:
  - Auswahl „Für wie viele Personen?“: Chips 1 / 2 / 5 / 10 und ein Zahlenfeld.
  - Badge „2/5 genutzt“, aufklappbare Liste der Nutzer.
  - `mailtoFor()` verwendet den Text „Der Code funktioniert für bis zu X Personen“ (Einzahl/Mehrzahl).

### 2c. Chefansicht-App (`C:\Anton\Chefansicht-AndroidApp`)
- `supabase/functions/chef-admin/index.ts`:
  - `createCode` nimmt `maxUses` an. Fehlt der Wert, gilt 1, damit die Funktion rückwärtskompatibel bleibt.
  - `listCodes` liefert `max_uses`, `use_count` und die Einlösungen samt E-Mails.
- `utils/chefAdmin.ts`: Signatur `createCode(note, expiresInDays, maxUses)` und die Typen anpassen.
- `components/chef/CodesTab.tsx`: gleiche Oberfläche wie im Web-Panel (Personenzahl, „x/y genutzt“, Nutzerliste). `statusOf` und `inviteText` werden angepasst.
- Gespiegeltes `src/db/schema.ts` aktualisieren und `schemaInfo.generated.ts` neu erzeugen (das macht `/push-chef-app`).
- **Ausrollreihenfolge:** zuerst die DB-Migration, dann `supabase functions deploy chef-admin`, dann die Web-App (`/push-web-app`), dann `/push-chef-app`. Weil jeder Schritt rückwärtskompatibel ist, geht unterwegs nichts kaputt.

---

## Phase 3 – Demo-Modus (ohne Supabase)

### Architektur: eine Datenquelle als Context statt direkter Importe
Heute importieren 6 Komponenten `supabase` und rund 20 Server Actions direkt (MobileDashboard, AddExpenseForm, SettingsOverlay, FunAccountHub, FunAccountView, ImportWizard). Es gibt noch keinen Provider.

- Neu: `lib/data/DataProvider.tsx` mit `useData()`. Es liefert `{ db, actions, mode: 'live' | 'demo' }`.
  - **Live:** `db` ist der bestehende Client aus `utils/supabase.ts`, `actions` ist ein Objekt mit den echten Server Actions (`funAccount`, `funGroups`, `savings`, `import`, `emailConnection`).
  - **Demo:** `db = createDemoClient()`, `actions = demoActions`.
- In den 6 Komponenten wird `import { supabase }` bzw. der direkte Import einer Action durch `const { db, actions } = useData()` ersetzt. Das ist rein mechanisch, das Verhalten im Live-Modus bleibt gleich.
- `app/page.tsx` umschließt die App mit `<DataProvider mode="live">`.

### Demo-Client `lib/demo/demoClient.ts`
- Ein in-memory-Abfrage-Builder mit derselben Form wie Supabase, gespeichert im **localStorage** (Schlüssel `cashflow-demo:v1`).
- Er unterstützt nur die tatsächlich benutzten Ketten: `from().select().eq/neq/order/single/maybeSingle`, `insert().select().single()`, `update().eq()`, `delete().eq()`. Antwortform `{ data, error }`. IDs werden hochgezählt, `numeric`-Beträge als Strings gespeichert wie in der echten Datenbank.
- `auth`-Stub: `getUser` und `getSession` liefern einen festen Demo-Nutzer, `signOut` beendet die Demo und führt zu `/`, `onAuthStateChange` tut nichts.
- Abgedeckte Tabellen: `expenses`, `fixed_costs`, `accounts`, `settings`, `income_sources`, `receipt_items`, `products`, `account_transactions`, `fun_accounts_v2`, `fun_groups`, `fun_group_expenses`, `fun_income_entries`.
- Bei einer unbekannten Tabelle oder Kette kommt ein klarer Fehler `{ error }` statt eines stillen Netzwerkaufrufs.

### Demo-Actions `lib/demo/demoActions.ts`
- Lokale Nachbauten der Server Actions auf Basis des Demo-Clients: Spaßkonto, Gruppen, Einnahmen, `addAccountExpense`, `depositToFunAccount`, `bulkImportAll`.
- `processWeeklySavings` und `processFunAccountFeeds` tun im Demo-Modus nichts. Die Seed-Daten sind schon „verarbeitet“.
- Nicht verfügbar in der Demo, mit dem Hinweis „In der Demo nicht verfügbar“:
  - REWE-Mail-Verbindung (`saveEmailConnection` usw.)
  - Konto löschen
  - Backup einspielen ist erlaubt, aber nur lokal

### Beispieldaten `lib/demo/seed.ts`
- Werden **relativ zu heute** erzeugt (letzte ca. 10 Wochen), mit einem Zufallsgenerator mit festem Startwert. So sieht die Demo immer frisch und gleich aus.
- Inhalt:
  - Gehalt 2.400 €/Monat, Nebenjob
  - Fixkosten: Miete, Handy, Streaming, Versicherung (jährlich)
  - Ein Sparkonto „Urlaub“ und ein Verteilungskonto
  - Ein Spaßkonto mit einer Gruppe „Städtetrip“
  - ca. 60 variable Ausgaben (Supermarkt, Tanken, Café …) und ein paar REWE-Bon-Artikel
- Datumsformate wie im Original: `expense_date` als ISO-Text, mittags normalisiert. So rechnet `utils/girokonto.ts` unverändert.

### Route `app/demo/page.tsx`
- Client-Seite: `<DataProvider mode="demo">` lädt die Daten aus dem Demo-Speicher (oder legt sie beim ersten Besuch aus dem Seed an). `monthlyBudget` wird mit **derselben** Formel wie in `app/page.tsx` berechnet. Diese Formel kommt dafür als reine Funktion nach `utils/financeHelpers.ts`, mit Test, damit es keine parallele Berechnung gibt (siehe `RULES.md`). Danach wird `MobileDashboard` mit `onUpdate = reload` gerendert.
- Oben ein kleines **Demo-Banner** (Glassmorphism, Theme-Farben): „Demo – deine Eingaben bleiben nur in diesem Browser“, mit den Knöpfen **Tour starten**, **Zurücksetzen**, **Konto erstellen** (→ `/` im Modus Registrierung) und den Links zu Impressum und Datenschutz.
- Auf dem `LoginScreen` gibt es einen deutlichen Zweitknopf **„App ausprobieren (Demo)“** → `/demo`.
- **Kein Supabase-Zugriff, dreifach abgesichert:**
  1. Die Middleware nimmt `/demo` aus.
  2. Im Demo-Modus wird der echte Client nie aufgerufen.
  3. Ein E2E-Test prüft, dass auf `/demo` **keine einzige Anfrage** an die `*.supabase.co`-Domain und kein POST auf eine Server Action geht.
- Der Service Worker cached `/demo` nicht anders als den Rest. Kurz prüfen, ob `public/service-worker.js` Navigationen cached.

---

## Phase 4 – Geführte Einführungstour

### Eigene, schlanke Tour-Komponente (keine Bibliothek)
Eine Eigenbau-Lösung passt besser zum Apple-artigen Design und kann auf Klicks warten. Ein fertiges Paket wie driver.js bräuchte für die „tippe hier“-Schritte ohnehin Sonderlogik.
- `components/tour/GuidedTour.tsx`:
  - Spotlight: abgedunkelter Hintergrund mit Aussparung per `box-shadow`, `rounded-3xl`.
  - Tooltip-Karte mit Text, Fortschritt „3/12“ und den Knöpfen **Weiter**, **Zurück**, **Tour beenden**.
  - Erreichbar per Tastatur (Esc beendet die Tour), mit `aria-live`.
- `lib/demo/tourSteps.ts`: Jeder Schritt hat `{ target: '[data-tour="add-button"]', title, text, advance: 'next' | 'click' | 'input', placement }`.
  - `click`: Der Nutzer muss selbst auf das markierte Element tippen. Die Tour geht erst danach weiter. So entsteht „Drücke hier, um einen Eintrag zu machen“.
  - Wartet über einen `MutationObserver`, bis das Ziel-Element erscheint. Das ist nötig, weil Ansichten und Overlays erst nach dem Klick gerendert werden. Fehlt es nach ca. 3 Sekunden, erscheint eine zentrierte Karte, die Tour hängt also nicht.
- An den Zielelementen werden `data-tour="..."`-Attribute ergänzt: MobileDashboard (Ring, Tagesbudget, Plus-Knopf, Spaßkonto-Kachel, Girokonto-Karte, Dock-Knöpfe), AddExpenseForm (Betrag, Kategorie, Speichern), Historie-Reiter und Einstellungs-Abschnitte. Im Live-Modus haben die Attribute keine Wirkung.
- Startet beim ersten Demo-Besuch automatisch. `cashflow-demo:tour-done` steht im localStorage, über das Banner lässt sich die Tour jederzeit neu starten.

### Ablauf der Tour (ca. 12 Schritte)
1. Willkommen: Was die App macht (Weiter / Überspringen)
2. Budget-Ring: wie viel diese Woche noch übrig ist
3. „Noch X Tage · €/Tag“
4. **„Tippe auf das Plus, um eine Ausgabe einzutragen“** (Klick)
5. Betrag eingeben (Eingabe) → Kategorie → **Speichern** (Klick)
6. „Siehst du? Der Ring hat sich sofort angepasst“
7. Spaßkonto-Kachel: Gruppen wie Urlaube
8. Girokonto-Karte (Klick) → Tagesverlauf erklären → zurück
9. **Historie** im Dock (Klick) → Kalender / Liste / Analyse
10. **Einstellungen** (Klick) → Einnahmen, Fixkosten, Konten
11. Hinweis auf Import und Backup
12. Ende: „Gefällt dir? → Konto erstellen“ oder frei weiter erkunden

---

## Wichtige Dateien

**Web (dieses Repo)**
- Rechtliches: `middleware.ts`, `components/LoginScreen.tsx`, `components/SettingsOverlay.tsx`, `app/actions/auth.ts`, `app/page.tsx`
- Einladungscodes: `src/db/schema.ts`, `app/types.ts`, `utils/inviteCode.ts`, `app/actions/inviteCodes.ts`, `components/admin/InviteCodePanel.tsx`
- Demo: `components/MobileDashboard.tsx`, `AddExpenseForm.tsx`, `FunAccountHub.tsx`, `FunAccountView.tsx`, `ImportWizard.tsx`, `utils/financeHelpers.ts`

**Neu (Web)**
- `lib/legal/operator.ts`, `app/impressum/page.tsx`, `app/datenschutz/page.tsx`
- `drizzle/0007_invite_code_multi_use.sql`, `scripts/apply-0007-invite-multi-use.mjs`
- `lib/data/DataProvider.tsx`, `lib/demo/{demoClient,demoActions,seed,tourSteps}.ts`, `app/demo/page.tsx`
- `components/tour/GuidedTour.tsx`, `components/DemoBanner.tsx`

**Chefansicht**
- `supabase/functions/chef-admin/index.ts`, `utils/chefAdmin.ts`, `components/chef/CodesTab.tsx`, `src/db/schema.ts`

## Verifikation
- **Unit-Tests (`npm run test`):**
  - `inviteStatus()`
  - `monthlyBudget`-Funktion (gleiches Ergebnis wie bisher)
  - Demo-Client: insert/update/delete/select und Persistenz
  - Seed: Die Girokonto-Timeline läuft ohne NaN durch
- **Einladungscode-Flow:** `scripts/test-invite-flow.mjs` erweitern. Ein Code mit `max_uses = 2` wird von **3 parallelen** Registrierungen benutzt: genau 2 gelingen, die dritte bekommt „bereits von allen Personen verwendet“. Außerdem einen abgelaufenen Code testen und den Fall, dass `createUser` fehlschlägt (das Kontingent wird wieder freigegeben).
- **E2E (`npm run test:e2e`), neue Spec `e2e/demo.spec.ts`:**
  - Vom Login aus „App ausprobieren“, dann die Tour komplett durchklicken.
  - Eine Ausgabe anlegen, neu laden: die Ausgabe ist noch da. „Zurücksetzen“: der Seed ist wieder da.
  - **Keine Anfrage an Supabase** (Playwright `page.on('request')`).
- **E2E Rechtliches:**
  - `/impressum` und `/datenschutz` sind ohne Login erreichbar.
  - Ohne Häkchen lässt sich die Registrierung nicht abschicken.
- **Manuell:** Preview im Browser auf Handy-Breite (375 px), Light- und Dark-Theme, Tour auf dem Handy. Zuletzt die Chefansicht nach `/push-chef-app` auf dem Handy: Code für 3 Personen anlegen, die Anzeige „0/3“, nach einer Registrierung „1/3“ mit E-Mail.
- `npm run lint` und `npm run build` vor dem Push.

## Offene Punkte für dich
- Echte Betreiberdaten (Name, Anschrift, Kontakt-E-Mail) für Impressum und Datenschutz.
- Supabase-Region (im Dashboard unter Project Settings nachsehen) für die Datenschutzerklärung.
- Ob „Konto löschen“ (1e) gleich mitgebaut werden soll.
