# Performance-Plan Web-App

Stand: 12.10.2026 · Ergebnis eines Code-Scans (kein Lighthouse-/Bundle-Messlauf, siehe Phase 0).

## Kurzfassung

Nein, es liegt **nicht nur an Vercel und der Internetverbindung**. Der größte Teil der Wartezeit
entsteht im Code selbst:

1. **Ladekette (Wasserfall):** Bis die Startseite Zahlen zeigt, laufen mehrere Netzwerk-Runden
   *nacheinander* statt parallel – und nach dem Start werden fast dieselben Daten ein zweites Mal geladen.
2. **Zu großes JavaScript-Paket:** Alles (Diagramme, PDF-Export, Einstellungen, Import, Spaßkonto,
   Demo-Code) wird beim ersten Öffnen geladen, obwohl der Nutzer zuerst nur den Budget-Ring sieht.
3. **Alles neu laden nach jeder Änderung:** Jede gespeicherte Ausgabe lädt 7 Tabellen komplett neu,
   inklusive *aller* Ausgaben und Bon-Artikel seit Beginn.
4. **Datenbank ohne Indizes auf `user_id`:** Mit RLS filtert jede Abfrage nach `user_id`, die
   Haupttabellen haben dafür aber keinen Index → Postgres durchsucht die ganze Tabelle aller Nutzer.
5. **Middleware ruft bei jedem Request den Supabase-Auth-Server an**, obwohl die Startseite eine reine
   Client-Seite ist.

Vercel selbst ist schnell; die eigentliche Latenz ist die Strecke Browser → Supabase (Region prüfen!).
Jede Runde, die wir einsparen, spart ~50–300 ms auf dem Handy.

---

## Phase 0 – Messen (vor jeder Änderung)

Ohne Messung weiß man nicht, ob eine Optimierung etwas bringt.

| Schritt | Wie |
|---|---|
| Bundle-Größe | `@next/bundle-analyzer` als devDependency, `ANALYZE=true npm run build` → zeigt, welche Pakete im Startseiten-Bundle stecken. |
| Ladezeit echt | Chrome DevTools → Performance, „Fast 4G“ + 4× CPU-Drosselung, eingeloggt auf `/`. Zeit bis Budget-Ring sichtbar notieren. |
| Netzwerk-Runden | DevTools → Network, Filter `supabase.co`: Anzahl und Reihenfolge der Requests beim Start zählen. |
| Vercel | Speed Insights im Vercel-Dashboard aktivieren (kostenlos im Hobby-Plan) für echte Nutzerwerte (LCP, INP). |
| Supabase-Region | Im Supabase-Dashboard prüfen, ob das Projekt in `eu-central-1` (Frankfurt) liegt. Vercel-Functions-Region (`vercel.json` → `"regions": ["fra1"]`) auf dieselbe Region legen. Ein US-Projekt kostet pro Runde ~100–150 ms extra. |

---

## Phase 1 – Schnelle Gewinne (wenig Risiko, je < 1 h)

### 1.1 PDF-Bibliotheken nur bei Klick laden
`jspdf` + `jspdf-autotable` (~350 KB minifiziert) werden **statisch** importiert in
`components/MobileDashboard.tsx:32`, `components/AnalysisView.tsx:6` und `components/SettingsOverlay.tsx:7`
– also beim App-Start geladen, obwohl PDF-Export selten genutzt wird.

```ts
const generatePDF = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'),
  ])
  ...
}
```

### 1.2 Service-Worker: leeren `fetch`-Handler entfernen
`public/service-worker.js` registriert einen `fetch`-Listener, der nichts tut. Chrome muss trotzdem
für **jeden** Request den Service-Worker starten → messbar langsamere Navigation (Chrome warnt
dazu sogar in der Konsole). Entweder den Listener löschen oder in Phase 4 echtes Caching einbauen.
Zusätzlich `console.log` in `components/SWRegister.tsx` entfernen.

### 1.3 Riesige Bilder verkleinern
| Datei | Größe | Verwendet? |
|---|---|---|
| `public/app-icon-original.png` | **7,9 MB** | nein → löschen (liegt aber im Repo und wird mit deployt) |
| `public/app-icon.png` | 505 KB | ja, Apple-/Manifest-Icon → auf 512×512 + 192×192 exportieren, Ziel < 50 KB |
| `public/head-icon.png` | 433 KB | nirgends referenziert → löschen |
| `public/floral_bg.png`, `two_roses_bg.png` | 58 / 41 KB | nirgends referenziert → prüfen/löschen |
| `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`, `manifest.json.old` | – | Next-Vorlagen-Reste → löschen |

### 1.4 Middleware nicht für statische Dateien laufen lassen
`middleware.ts` → `updateSession()` macht `supabase.auth.getUser()` = **ein Netzwerk-Request an
Supabase pro Request**. Der Matcher schließt Bilder aus, aber nicht `service-worker.js`, `manifest.webmanifest`,
`*.ico`-Varianten, `*.js`/`*.json`. Matcher erweitern:

```ts
'/((?!_next/static|_next/image|favicon.ico|service-worker.js|manifest.webmanifest|impressum|datenschutz|demo|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json|txt)$).*)'
```

Größerer Schritt (Phase 3.3): die Middleware für `/` ganz weglassen, weil die Seite die Session
ohnehin im Browser prüft.

### 1.5 Unnötige Schrift streichen / prüfen
`app/layout.tsx` lädt drei Google-Fonts (Geist, Geist Mono, Manrope). Alle werden genutzt
(`.amount`/`.eyebrow` = Mono, Überschriften = Manrope). Optimierung: bei `Geist_Mono` und `Manrope`
`preload: false` setzen, damit nur die Hauptschrift den ersten Seitenaufbau blockiert, und
`display: 'swap'` explizit angeben.

### 1.6 `console.log` aus dem Startpfad entfernen
`MobileDashboard.tsx:143` (`--- Init Dashboard ---`), `app/actions/savings.ts:8` u. a. – kosten
wenig, sind aber Müll in Produktion.

---

## Phase 2 – Code-Splitting: nur laden, was sichtbar ist (größter Bundle-Gewinn)

`MobileDashboard.tsx` importiert **statisch** alle Unteransichten. Beim Start wird dadurch geladen:

- `AnalysisView` + 5 Analyse-Tabs → **recharts** (~400 KB min., größtes Paket der App)
- `GirokontoView` → ebenfalls recharts
- `SettingsOverlay` (2049 Zeilen!) → `ImportWizard`, `HelpModal`, `FunAccountHub`, Theme-Auswahl
- `FunAccountHub` (757 Zeilen), `FunAccountView`
- `CalendarHistory`, `AddExpenseForm`, `react-day-picker`

Auf dem Startbildschirm braucht man davon **nichts** außer dem Ring und den Kacheln.

### 2.1 `next/dynamic` für alle Unteransichten

```ts
import dynamic from 'next/dynamic'
const AnalysisView    = dynamic(() => import('./AnalysisView'),    { ssr: false, loading: () => <ViewSpinner /> })
const GirokontoView   = dynamic(() => import('./GirokontoView'),   { ssr: false })
const SettingsOverlay = dynamic(() => import('./SettingsOverlay'), { ssr: false })
const FunAccountHub   = dynamic(() => import('./FunAccountHub'),   { ssr: false })
const FunAccountView  = dynamic(() => import('./FunAccountView'),  { ssr: false })
const CalendarHistory = dynamic(() => import('./CalendarHistory'), { ssr: false })
const AddExpenseForm  = dynamic(() => import('./AddExpenseForm'),  { ssr: false })
```

Innerhalb von `SettingsOverlay` genauso: `ImportWizard`, `HelpModal`, `FunAccountHub` dynamisch.

### 2.2 Vorladen bei Absicht (fühlt sich sofort an)
Damit der erste Klick auf „Historie“ nicht wartet: beim `onPointerDown`/`onMouseEnter` des
Dock-Buttons oder per `requestIdleCallback` nach dem ersten Rendern `import('./AnalysisView')`
anstoßen. So kostet der Split keine gefühlte Wartezeit.

### 2.3 Demo-Code aus dem Live-Bundle werfen
`lib/data/actions.ts` importiert `lib/demo/demoActions` (+ `demoClient`, `seed`) **statisch** – die
gesamte Demo-Logik mit Beispieldaten landet im Bundle jedes echten Nutzers. Umbauen auf:

```ts
function route(live, loadLocal) {
  return async (...args) => isDemoMode()
    ? (await import('@/lib/demo/demoActions'))[loadLocal](...args)
    : live(...args)
}
```

### 2.4 `lucide-react` und `date-fns` prüfen
Beide sind tree-shakebar, Next 16 optimiert `lucide-react` automatisch. Im Bundle-Analyzer
(Phase 0) kontrollieren; nur handeln, falls dort große Brocken auftauchen. `date-fns/locale`
(`de`) ist ok, solange nur `de` importiert wird.

---

## Phase 3 – Datenladen entschlacken (größter Gewinn für die gefühlte Startzeit)

### Ist-Zustand beim App-Start (eingeloggt)

```
1. Middleware: auth.getUser()                       → Supabase Auth   (Server)
2. page.tsx:  auth.getSession()                     → lokal (schnell)
3. page.tsx:  7 Tabellen parallel                   → Supabase DB      ← gut
   (bei neuem Nutzer zusätzlich settings-Insert)
--- Budget-Ring sichtbar ---
4. MobileDashboard: auth.getUser()                  → Supabase Auth   (Netzwerk!)
5.   processWeeklySavings  (Server Action)          → Vercel → Supabase: settings, ggf. ALLE expenses, fixed_costs …
6.   processFunAccountFeeds (Server Action)         → Vercel → Supabase  (wartet auf 5)
7.   accounts + settings  ERNEUT laden (nacheinander!) → Supabase  (wartet auf 6)
8.   je Verteilkonto ein UPDATE nacheinander
9.   ggf. onUpdate() → ALLE 7 Tabellen neu
parallel dazu:
10. fun_accounts_v2 → danach 3 weitere Abfragen      (2 Runden)
```

### 3.1 Start-Jobs zusammenfassen und vom Client wegnehmen
Schritte 4–8 in **eine** Server Action `runStartupJobs()` bündeln (Wochensparen, Spaßkonto-Feeds,
Verteilkonten). Vorteile: 1 Runde Browser→Vercel statt 5–6 Browser→Supabase-Runden; die
Verteilkonto-Logik (aktuell im Client, mit `update` pro Konto) läuft serverseitig in der Nähe der DB.
- `supabase.auth.getUser()` im Client entfällt (die User-ID ist schon in `session` vorhanden bzw.
  wird serverseitig aus dem Cookie gelesen).
- `onUpdate()` nur aufrufen, wenn die Action wirklich etwas verändert hat (Flag zurückgeben).
- Idealerweise gar nicht bei jedem App-Start: Ergebnis-Datum in `settings` speichern und nur
  einmal pro Tag/Woche ausführen (ist teilweise schon so, aber die Abfragen laufen trotzdem jedes Mal).

### 3.2 Spaßkonto-Saldo in den Hauptladevorgang ziehen
`MobileDashboard.tsx:97-116` lädt nach dem Rendern `fun_accounts_v2` und **danach** 3 Tabellen.
Besser: `fun_accounts_v2` direkt im `Promise.all` von `page.tsx` mitladen; Gruppen/Ausgaben/
Einnahmen über einen Join in einer Abfrage holen:

```ts
supabase.from('fun_accounts_v2')
  .select('*, fun_groups(*), fun_group_expenses(amount, expense_date), fun_income_entries(amount, income_date)')
  .maybeSingle()
```
→ 1 statt 2 Runden, und die Kachel „flackert“ nicht nach.

### 3.3 Middleware für `/` streichen (oder entschärfen)
`/` ist eine reine Client-Seite und prüft die Session selbst. Der `getUser()`-Aufruf in der
Middleware verzögert daher **jedes** Laden von `/` um eine Auth-Runde. Optionen:
- Middleware nur für Routen laufen lassen, die serverseitig Supabase nutzen (`/admin`, `/api`,
  `/reset-password`), oder
- in der Middleware `getClaims()` statt `getUser()` verwenden. Das prüft das JWT lokal ohne
  Netzwerk, setzt aber asymmetrische JWT-Signaturschlüssel im Supabase-Projekt voraus. Vorher in
  der aktuellen Supabase-Doku prüfen, ab welcher Version das unterstützt wird.

### 3.4 Nicht mehr alles bei jeder Änderung neu laden
`onUpdate = fetchData` lädt nach jeder gespeicherten Ausgabe 7 Tabellen komplett. Stufenweise:
1. **Gezieltes Nachladen:** `fetchData(['expenses'])` – nur die betroffene Tabelle neu holen.
2. **Optimistisches Update:** neue Ausgabe sofort lokal in den State einfügen, Ring springt sofort;
   im Hintergrund speichern, bei Fehler zurückrollen.
3. Optional: **SWR oder TanStack Query** einführen – bringt Cache, Deduplizierung, Hintergrund-
   Aktualisierung und `mutate()` mit; ersetzt den handgebauten `useState`/`fetchData`-Mechanismus.

### 3.5 Weniger Daten pro Abfrage
- `select('*')` → nur benötigte Spalten (z. B. `expenses`: `id, amount, category, description, expense_date, created_at, account_id, transfer_id`). Weniger Bytes, und neue Spalten landen nicht automatisch im Startpaket.
- `receipt_items` und `products` werden beim Start komplett geladen, aber nur in der
  Transaktionsliste (aufgeklappt) und im Einkäufe-Tab gebraucht → erst laden, wenn diese Ansicht
  geöffnet wird.
- Alle Ausgaben seit Beginn werden geladen. Für den Girokonto-Verlauf wird zwar die komplette
  Historie gebraucht, langfristig aber besser: Tagessummen serverseitig per SQL-View/RPC
  (`select expense_date::date, sum(amount) … group by 1`) liefern, statt tausende Einzelzeilen zu
  übertragen. **Achtung `RULES.md`:** die Girokonto-Berechnung muss identisch bleiben – nur die
  Eingabe (Tagessummen statt Einzelzeilen) ändert sich, die Rechnung in `utils/girokonto.ts` nicht.

### 3.6 Datenbank-Indizes anlegen (wichtig, sobald mehrere Nutzer da sind)
Jede Abfrage läuft durch RLS (`(select auth.uid()) = user_id`) – gut optimiert in
`scripts/optimize_rls.sql`. Aber `expenses`, `fixed_costs`, `accounts`, `settings`,
`income_sources`, `products`, `fun_accounts_v2` haben **keinen Index auf `user_id`**
(nur `receipt_items` und die `fun_*`-Tabellen haben einen). Folge: Postgres liest die gesamte
Tabelle aller Nutzer bei jeder Abfrage.

Neue Migration `drizzle/0009_user_id_indexes.sql` (laut Memory: **von Hand schreiben**, nicht
`drizzle-kit generate`, und nicht `drizzle-kit migrate` ausführen):

```sql
CREATE INDEX IF NOT EXISTS expenses_user_date_idx    ON expenses (user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS fixed_costs_user_idx      ON fixed_costs (user_id);
CREATE INDEX IF NOT EXISTS accounts_user_idx         ON accounts (user_id);
CREATE INDEX IF NOT EXISTS settings_user_idx         ON settings (user_id);
CREATE INDEX IF NOT EXISTS income_sources_user_idx   ON income_sources (user_id);
CREATE INDEX IF NOT EXISTS products_user_idx         ON products (user_id);
CREATE INDEX IF NOT EXISTS expenses_transfer_idx     ON expenses (transfer_id) WHERE transfer_id IS NOT NULL;
```
Zusätzlich in `src/db/schema.ts` als `index(...)` nachziehen. Vorher im Supabase-Dashboard unter
*Advisors → Performance* prüfen, was Supabase selbst als fehlend meldet.

---

## Phase 4 – Rechenarbeit im Browser reduzieren

### 4.1 Girokonto-Simulation nur einmal rechnen
`calculateGirokontoTimeline` läuft **dreimal** mit identischen Eingaben: in
`MobileDashboard.tsx:206`, `GirokontoView.tsx:27` und `AnalysisView.tsx:134`. Bei 2 Jahren Daten
sind das je ~730 Tage × (Fixkosten + Einnahmen) Iterationen plus neue `Date`-Objekte.
→ Einmal in `MobileDashboard` berechnen und `timeline` als Prop an die beiden Ansichten durchreichen.

### 4.2 Simulation selbst beschleunigen (`utils/girokonto.ts`)
- In der Tagesschleife wird für **jede** Fixkosten/Einnahme **jeden Tag** `new Date(fc.valid_from)`
  und `new Date(fc.valid_to)` neu erzeugt. Einmal vor der Schleife in Zahlen (`getTime()`) umwandeln.
- `format(simDate, 'yyyy-MM-dd')` aus date-fns pro Tag ist vergleichsweise teuer → eigener schneller
  Key aus `getFullYear/getMonth/getDate`.
- `Math.min(...allDates)` mit Spread kann bei sehr vielen Ausgaben (> ~100 000) den Stack sprengen →
  normale Schleife.
- **Ergebnis bleibt bit-identisch**; vorher Unit-Test schreiben, der die alte und neue Version mit
  denselben Daten vergleicht (Regel aus `RULES.md`).

### 4.3 `MobileDashboard` – Berechnungen im Render memoisieren
Bei **jedem** Re-Render (jede Tastatureingabe im Schnell-Ausgabe-Dialog!) laufen ohne `useMemo`:
`activeFixedCostsForBudget`, `calculateWeeklyIncome`, `relevantExpensesThisWeek` (über alle
Ausgaben), `categoryInsight` (noch ein Durchlauf über alle Ausgaben), `sparkPoints`,
`getWeeklyGroups()` (alle Ausgaben, `startOfWeek` + `toISOString` pro Ausgabe).
→ In `useMemo` mit Abhängigkeit `[expenses, …]` packen.

### 4.4 Riesen-Komponenten aufteilen
`SettingsOverlay.tsx` (2049 Zeilen) und `MobileDashboard.tsx` (1071 Zeilen) haben sehr viel State
in einer Komponente → jeder Tastendruck rendert alles neu. Aufteilen in Unterkomponenten mit
eigenem State (z. B. `FunGroupQuickAddDialog`, `HistoryList`, `EditExpenseDialog`, die einzelnen
Einstellungs-Abschnitte). Gleichzeitig Wartbarkeit verbessert.

### 4.5 `AnalysisView` – O(n²)-Stellen
`AnalysisView.tsx` filtert in Schleifen wiederholt über alle Ausgaben (`isSameDay` je Tag × je
Ausgabe, mehrere `filter` hintereinander). Einmal nach Tages-Key gruppieren (`Map`) und dann
nachschlagen. Zusätzlich hängt das große `useMemo` an `budget`, das sich bei jedem Eltern-Render
als neu berechnete Zahl mitbewegt – ok, aber prüfen, dass keine neuen Array-Referenzen
reingereicht werden.

### 4.6 Lange Listen
Die Wochenliste in der Historie rendert alle Wochen seit Beginn mit Stagger-Animation. Bei
> 100 Einträgen: nur die letzten N anzeigen + „Mehr laden“, oder `content-visibility: auto` auf
`.ledger-row`.

---

## Phase 5 – PWA richtig nutzen (gefühlt „sofort da“)

Der Service-Worker tut aktuell nichts. Mit echtem Caching öffnet sich die installierte App
auch bei schlechtem Netz sofort:

1. **App-Shell cachen:** `_next/static/*` (Cache-First – Dateien sind gehasht), Fonts, Icons.
2. **Zuletzt geladene Daten lokal halten:** Ergebnis von `fetchData` in IndexedDB/localStorage
   speichern, beim Start **sofort** anzeigen und im Hintergrund aktualisieren
   („stale-while-revalidate“). Der Nutzer sieht den Budget-Ring in < 0,5 s, auch im Funkloch.
3. Werkzeug: `@serwist/next` (Nachfolger von next-pwa, unterstützt App Router) statt eigenem SW.
4. Cache-Version beim Deploy hochzählen, damit keine alten Bundles hängen bleiben.

**Datenschutz-Hinweis:** Finanzdaten lokal zu cachen ist ok für eine Single-User-App, aber beim
Logout muss der Cache gelöscht werden.

---

## Phase 6 – Aufräumen (Müll im Repo)

Hat keinen direkten Einfluss auf die Geschwindigkeit der App für Nutzer, aber auf Build-/Deploy-
Zeit und Übersicht.

| Was | Aktion |
|---|---|
| `build_debug.log`, `build_debug_2.log`, `build_log.txt`, `diagnosis.log`, `diagnosis_output.txt`, `drizzle_error_log.txt`, `lint.txt`, `lint_utf8.txt`, `verify_error.txt` | löschen + in `.gitignore` (`*.log`, `*_output.txt` …) |
| `schema_dump.json`, `schema_partial.json`, `migration.sql`, `inspect_db.ts`, `check_icon.ps1`, `fix_icon.ps1` | löschen oder nach `scripts/` verschieben |
| `playwright-report/`, `test-results/` (532 KB, eingecheckt) | aus Git entfernen + `.gitignore` |
| **`scripts/userdata.json`** | **enthält echte Nutzerdaten (User-ID, Salden) im Git-Repo** → sofort entfernen; ggf. aus der Git-Historie tilgen, falls das Repo öffentlich ist/wird |
| `public/app-icon-original.png` (7,9 MB) u. ungenutzte Bilder | siehe 1.3 |
| `components/DashboardHealth.tsx` | laut Kommentar in `MobileDashboard.tsx:28` „REMOVED“ → prüfen, ob noch irgendwo genutzt, sonst löschen |
| `dotenv`, `postgres`, `drizzle-orm` in `dependencies` | werden nur von Skripten/Drizzle-Kit gebraucht → in `devDependencies` (wirkt nicht auf Client-Bundle, aber auf Install-Zeit) |
| `shadcn` in `dependencies` | ist ein CLI-Tool → `devDependencies` |
| Auskommentierter Code / „Legacy“-Kommentare in `MobileDashboard.tsx` (z. B. Z. 366-369) | entfernen |
| `.eslint`-Fehler (`lint.txt`) | einmal `npm run lint` laufen lassen und aufräumen |

---

## Empfohlene Reihenfolge

| # | Maßnahme | Aufwand | Wirkung | Risiko |
|---|---|---|---|---|
| 1 | Phase 0 – Messen, Supabase-/Vercel-Region prüfen | 30 min | Klarheit | – |
| 2 | 1.1 PDF dynamisch, 1.2 SW-Fetch-Handler weg, 1.3 Bilder | 1 h | mittel | sehr gering |
| 3 | 3.6 DB-Indizes | 30 min | hoch bei wachsender DB | gering |
| 4 | 2.1–2.3 Code-Splitting + Demo raus | 2–3 h | **hoch** (Startbundle deutlich kleiner) | gering (E2E-Tests vorhanden) |
| 5 | 3.1–3.3 Start-Wasserfall auflösen, Middleware entschärfen | 3–4 h | **hoch** (mehrere Runden weniger) | mittel – Sparlogik betroffen, gut testen |
| 6 | 4.1–4.3 Simulation einmal + Memoisierung | 2 h | mittel (vor allem ältere Handys) | gering mit Vergleichstest |
| 7 | 3.4–3.5 gezieltes Nachladen / optimistische Updates, weniger Spalten | 4–6 h | hoch (gefühlt „sofort“ beim Speichern) | mittel |
| 8 | Phase 6 – Aufräumen | 1 h | Ordnung, Datenschutz | gering |
| 9 | Phase 5 – PWA-Caching | 4–6 h | sehr hoch für installierte App | mittel (Cache-Invalidierung) |
| 10 | 4.4 Riesen-Komponenten aufteilen | laufend | Wartbarkeit + Tipp-Performance | gering |

**Nach jeder Phase:** `npm run test`, `npm run test:e2e`, `npm run build` und die Messwerte aus
Phase 0 vergleichen.
