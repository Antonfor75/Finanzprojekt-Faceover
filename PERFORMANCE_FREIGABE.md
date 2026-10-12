# Performance – Stand und Freigabeliste

Stand: 12.10.2026 · Branch `claude/webapp-performance-audit-55919f` (noch nicht committet)

## Bereits umgesetzt (ohne Änderung an Verhalten, Logik oder Optik)

| # | Was | Wirkung |
|---|---|---|
| 1 | Unteransichten (Analyse, Girokonto, Einstellungen, Spaßkonto) und `recharts` aus dem Startpaket genommen, laden getrennt und werden kurz nach dem Start im Hintergrund vorgeladen | Startpaket deutlich kleiner |
| 2 | PDF-Bibliothek (`jspdf`) erst laden, wenn eine Ansicht mit PDF-Knopf offen ist; Export läuft weiterhin direkt im Klick | ~350 KB raus aus dem Start |
| 3 | Dashboard-Code lädt parallel zu Anmeldung + Supabase-Abfragen statt vorher | Daten werden früher angefragt |
| 4 | Demo-Code (Beispieldaten, localStorage-Nachbau) nur noch auf `/demo` | Echte Nutzer laden ihn nicht mehr |
| 5 | Girokonto-Simulation ~2,5× schneller (keine neuen Datumsobjekte pro Tag und Quelle) | Weniger Rechenzeit auf dem Handy |
| 6 | Girokonto-Simulation läuft einmal statt bis zu dreimal (Dashboard, Girokonto, Analyse) | Schnelleres Öffnen der Ansichten |
| 7 | Analyse: Monatsgruppierung doppelt → einmal, schnelle Tagesschlüssel | Analyse rechnet weniger |
| 8 | Kalender: Tagessummen vorab statt „42 Tage × alle Ausgaben“ | Historie öffnet schneller |
| 9 | Dashboard: Wochen-/Insight-Berechnungen memoisiert (nicht mehr bei jedem Tastendruck) | Flüssigeres Tippen |
| 10 | Middleware: Service-Worker und Manifest lösen keinen Supabase-Auth-Aufruf mehr aus | Weniger Serverlast/Latenz |

**Gemessen:** JavaScript der Startseite **591 KB → 235 KB gzip (−60 %)**, roh 2,0 MB → 0,8 MB.

**Geprüft:**
- Build ok, 144 Unit-Tests grün (neu: Vergleichstest alte ↔ neue Simulation, 300 Zufallsdatensätze, bit-identisch; Tagesschlüssel ↔ date-fns inkl. Zeitumstellung)
- E2E Demo + Rechtsseiten grün; keine neuen Lint-Befunde
- Original (HEAD) und neue Version nebeneinander im Browser: alle Ansichten inkl. Diagrammpfade identisch (SHA-256 gleich), Ausgabe eintragen ergibt identische Werte, alle drei PDF-Exporte funktionieren
- **Nicht testbar hier:** echter Login-Flow – die 4 Tests in `e2e/main-flow.spec.ts` waren schon vorher kaputt (veraltete Texte, kein `TEST_EMAIL` in `.env`). Nach dem Deploy einmal einloggen und durchklicken.

---

## Zur Freigabe (sinnvoll, aber mit Einfluss)

Bitte einfach die Nummern freigeben oder streichen.

### A – Datenbank & Netzwerk (größter verbleibender Hebel)

| # | Maßnahme | Nutzen | Einfluss / Risiko |
|---|---|---|---|
| A1 | **Indizes auf `user_id`** für `expenses`, `fixed_costs`, `accounts`, `settings`, `income_sources`, `products` (+ `expenses(transfer_id)`) per handgeschriebener Migration | Abfragen bleiben schnell, wenn mehr Nutzer/Daten dazukommen | Datenbankänderung, muss in Supabase angewendet werden; sonst kein Risiko |
| A2 | **Start-Jobs bündeln** (Wochensparen, Spaßkonto-Feeds, Verteilkonten) in eine Server Action statt 5–6 Abfragen nacheinander aus dem Browser | Spürbar schnellerer Start, Verteilkonten-Logik läuft sicherer auf dem Server | Ändert Ablauf der Buchungslogik → gründlich testen |
| A3 | **Spaßkonto-Saldo** im Hauptladevorgang mitladen (1 Abfrage mit Join statt 2 Runden) | Kachel erscheint sofort statt nachzuflackern | Abfrage-Umbau, braucht Test mit echter DB |
| A4 | **Nur geänderte Tabelle neu laden** nach dem Speichern statt aller 7 Tabellen | Speichern fühlt sich schneller an | Änderung am Datenfluss |
| A5 | **Optimistische Updates**: neue Ausgabe sofort anzeigen, im Hintergrund speichern | Gefühlt „sofort“ | UX-Änderung: bei Fehler springt der Wert zurück |
| A6 | `receipt_items` und `products` erst laden, wenn Einkäufe/Bon-Details geöffnet werden | Weniger Daten beim Start | Kurzer Ladeindikator beim ersten Öffnen |
| A7 | Nur benötigte Spalten statt `select('*')` | Weniger Daten | Gefahr, dass ein Feld vergessen wird |
| A8 | Middleware für `/` streichen oder `getClaims()` statt `getUser()` | Ein Auth-Aufruf weniger pro Seitenaufruf | Sitzungs-Refresh-Verhalten ändert sich; `getClaims` braucht asymmetrische JWT-Keys |
| A9 | Vercel-Functions-Region (`vercel.json`) auf die Supabase-Region legen (z. B. `fra1`) | Server Actions schneller | Erst Supabase-Region prüfen |

### B – PWA / Laden

| # | Maßnahme | Nutzen | Einfluss / Risiko |
|---|---|---|---|
| B1 | Leeren `fetch`-Handler im Service-Worker entfernen | Jede Navigation minimal schneller | Ältere Android-Chrome-Versionen könnten die „Installieren“-Option anders anbieten |
| B2 | Echtes Offline-Caching (App-Shell + letzte Daten sofort anzeigen, z. B. `@serwist/next`) | App öffnet sofort, auch im Funkloch | Größere Änderung; kurzzeitig veraltete Zahlen sichtbar; Cache beim Logout löschen |
| B3 | Schriften Geist Mono + Manrope mit `preload: false` | Erster Seitenaufbau minimal schneller | Beträge/Überschriften können kurz in Ersatzschrift erscheinen |

### C – Aufräumen (kein Nutzer-Tempo, aber Deploy/Ordnung/Datenschutz)

| # | Maßnahme | Hinweis |
|---|---|---|
| C1 | **`scripts/userdata.json` aus dem Repo entfernen** | Enthält echte Nutzerdaten (User-ID, Salden). Ggf. auch aus der Git-Historie tilgen, falls das Repo öffentlich ist/wird |
| C2 | Ungenutzte Bilder löschen: `app-icon-original.png` (7,9 MB), `head-icon.png`, `floral_bg.png`, `two_roses_bg.png`, Next-Vorlagen-SVGs, `manifest.json.old` | Werden nirgends verwendet |
| C3 | `app-icon.png` (505 KB) auf 512×512 verlustarm verkleinern | Icon sieht gleich aus, lädt schneller |
| C4 | Log-/Debug-Dateien im Hauptordner löschen, `playwright-report/` + `test-results/` aus Git nehmen, `.gitignore` ergänzen | Reine Ordnung |
| C5 | `e2e/main-flow.spec.ts` reparieren (aktuelle Texte, `data-testid` oder `data-tour`, Test-Account in `.env`) | Damit der echte Login-Flow automatisch getestet wird |
| C6 | `dotenv`, `postgres`, `drizzle-orm`, `shadcn` nach `devDependencies` | Schnellere Installation, kein Einfluss aufs Bundle |
| C7 | `SettingsOverlay.tsx` (2049 Zeilen) und `MobileDashboard.tsx` in kleinere Komponenten aufteilen | Wartbarkeit, etwas flüssigeres Tippen |
