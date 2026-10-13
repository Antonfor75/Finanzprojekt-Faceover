# Performance – Stand und Freigabeliste

Stand: 13.10.2026 · Branch `claude/webapp-performance-audit-55919f` · Runde 1 live seit 12.10. (Commit `925f91d`), Runde 2 (Freigaben) siehe unten

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

## Runde 2 – freigegebene Punkte (13.10.2026)

| # | Status | Umsetzung |
|---|---|---|
| A1 | ✅ umgesetzt, in Supabase eingespielt | 9 Indizes auf `user_id` (`drizzle/0009_user_id_indexes.sql`, `scripts/apply-0009-user-id-indexes.mjs`, erst Dry-Run, dann live). `expenses(transfer_id)` gab es schon. |
| A2 | ✅ | `runStartupJobs` (`app/actions/startup.ts`): Wochensparen, Spaßkonto-Feeds, Verteilkonten in **einer** Server-Anfrage; Verteilkonten-Logik unverändert in `utils/distributions.ts` (mit Tests). Demo läuft lokal weiter. |
| A3 | ✅ | Spaßkonto-Kachel wird parallel zum Hauptladen geholt (`lib/data/funSummary.ts`) → kein Nachflackern. Gleiche Abfragen wie vorher (kein Join nötig). |
| A4 | ✅ | Nach Ausgabe anlegen/ändern/löschen werden nur `expenses` (+ ggf. Konten/Artikel) neu geladen, sonst wie bisher alles. |
| A5 | ✅ | Neue normale Ausgabe erscheint sofort, Formular schließt sofort; Fehler → Meldung, Eintrag verschwindet wieder. Sparkonto-Zahlungen bleiben beim alten Ablauf (Guthabenprüfung vorher). |
| A6 | ✅ | `receipt_items`/`products` erst beim Öffnen der Historie; Einkäufe-Tab zeigt so lange einen Ladekreis. |
| A7 | ⏸ bewusst nicht gemacht | Geprüft: Die App braucht fast alle Spalten; übrig bliebe nur `user_id` (~1–2 KB nach gzip). Das würde den Backup-Inhalt im PDF-Report verändern — Nutzen zu klein für das Risiko. |
| A8 | ✅ | Middleware nutzt `getClaims()` statt `getUser()` (fällt bei symmetrischem JWT-Schlüssel selbst auf `getUser()` zurück → kein Risiko). |
| A9 | ❌ abgelehnt | – |
| B1 | ✅ | In B2 aufgegangen (Service-Worker hat jetzt einen echten Fetch-Handler). |
| B2 | ✅ | Service-Worker cacht nur eigene statische Dateien (`/_next/static` + zuletzt geladene Seite, nur auf der echten Domain). Letzter Datenstand liegt pro Nutzer im Gerät und wird beim Öffnen sofort angezeigt, dann aktualisiert; beim Abmelden gelöscht. Offline-Start getestet (Server aus → App startet). |
| B3 | ❌ abgelehnt | – |
| C1 | ✅ | `scripts/userdata.json` gelöscht + in `.gitignore`. **Achtung:** Repo ist öffentlich, die Datei steckt noch in der Git-Historie (Commit `6831a7f`) → Tilgen braucht Force-Push, nur nach ausdrücklicher Freigabe. |
| C2 | ✅ | 10 ungenutzte Dateien in `public/` gelöscht (u. a. 7,9 MB `app-icon-original.png`). |
| C3 | ✅ | `app-icon.png` verlustfrei neu komprimiert (505 → 471 KB, pixelidentisch). Mehr ginge nur verlustbehaftet. |
| C4 | ✅ | Log-/Debug-Dateien gelöscht, `playwright-report/` + `test-results/` aus Git, `.gitignore` ergänzt. |
| C5 | ✅ | `e2e/main-flow.spec.ts` neu (aktuelle Oberfläche); läuft mit `TEST_EMAIL`/`TEST_PASSWORD` in `.env`, sonst übersprungen. Gleicher Ablauf zusätzlich als Demo-Test (`e2e/dashboard-demo.spec.ts`, läuft immer). |
| C6 | ✅ | `dotenv`, `postgres`, `drizzle-orm`, `shadcn` → `devDependencies`. |
| C7 | ✅ | `SettingsOverlay.tsx` 2051 → 358 Zeilen (`components/settings/*`: je Bereich Hook + Ansicht, Report, Backup); `MobileDashboard.tsx` 1131 → 931 Zeilen (`components/dashboard/*`: Historie, PDF). Zustand bleibt wo er war → Eingaben bleiben beim Zurückgehen erhalten wie vorher. |

**Geprüft (Runde 2):** 151 Unit-Tests grün (neu: Verteilkonten, Daten-Zwischenspeicher), Build ok, E2E 5/5 grün (+ Login-Test übersprungen, kein Testkonto), keine neuen Lint-Befunde, Startpaket unverändert 236 KB gzip. Alter und neuer Stand nebeneinander (Demo): alle Ansichten inkl. Einstellungen-Unterseiten, Tippen in Formularen und Historie/Analyse **DOM-identisch**; alle drei PDF-Exporte funktionieren.
