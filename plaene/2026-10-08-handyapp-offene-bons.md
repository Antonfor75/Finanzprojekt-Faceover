# Offene Bons: Qwen läuft im Hintergrund weiter, Freigabe über die Startseite

## Context

Heute hängt die Qwen-Auswertung an der Scan-Ansicht: Verlässt man sie zu früh (während Texterkennung/Modell-Laden), bricht der Lauf ab; das Ergebnis lebt nur im React-Zustand der (geparkten) Ansicht und ist nach einem App-Neustart weg. Der Zurück-Pfeil im Scanner wird von der Status-Zeile (z-60, `fixed top-0`) verdeckt, weil der Scanner-Kopf keinen Statusleisten-Abstand hat. Das KI-Protokoll in den Einstellungen öffnet sich scheinbar nicht.

Ziel (Wunsch des Nutzers):
1. Während der Auswertung jederzeit raus (Pfeil, Zurücktaste, App wegwischen ohne Schließen) — Qwen rechnet weiter.
2. Fertige, nicht gespeicherte Bons bleiben **offen**, bis sie freigegeben oder verworfen werden — auch über App-Neustart.
3. Startseite: Die Kachel „Ausgegeben“ wird **dauerhaft** durch eine **Bon-Kachel** ersetzt: neuester offener Bon mit Datum, Laden, Summe und Knopf „Freigeben“; Tipp auf die Kachel → Scan-Seite zum Prüfen. Daneben „Ignorieren“ (nächster offener Bon kommt nach vorn, dieser bleibt offen) und „Verwerfen“ (mit eindeutiger Sicherheitsabfrage). Nacheinander erscheinen so alle offenen Bons. Ohne offene Bons: „Keine offenen Bons“ + Scan-Knopf; läuft Qwen gerade: Fortschritt in der Kachel.
4. App ganz geschlossen während Qwen rechnet → beim nächsten Start automatisch weiterrechnen.
5. KI-Protokoll wieder öffnen können.

## Kernidee: Auswertung von der Ansicht lösen

Neue lokale Tabelle + Auftrags-Verwaltung in `utils/`, die Scan-Ansicht wird nur noch eine Anzeige eines Auftrags.

### 1. Datenhaltung — `utils/localdb.ts` (Dexie `version(4)`, additiv)
`pending_receipts: 'id, status, created_at'` mit Zeile `PendingReceiptRow`:
- `id` (uuid), `status: 'reading' | 'queued' | 'running' | 'ready' | 'failed'`, `source` (`scan|gallery|share`), `created_at`, `finished_at`, `skipped_at` (für Ignorieren-Reihenfolge)
- Eingang: `raw_lines`, `ocr_document`, `text_source`, `image_paths` (bereits in den App-Speicher kopiert, siehe 2)
- Ergebnis: `store`, `date`, `total`, `category`, `items` (Liste `ParsedReweItem`), `run_id`, `findings`, `error`
- Nutzer-Änderungen aus der Scan-Ansicht: `edits` (Felder, die von Hand geändert wurden) — damit ein späteres Weiterrechnen sie nicht überschreibt
- Nur lokal: nicht in den Sync-Tabellen, nicht in der Wissensschicht; nach Freigabe/Verwerfen gelöscht.

### 2. Bilder sofort sichern — `utils/receiptImages.ts`
Kamera-Bilder liegen im Cache und können verschwinden. Neu `stagePendingImages(pendingId, paths)`: kopiert nach `Directory.Data/receipts/pending/<id>/…` direkt nach der Aufnahme. Bei Freigabe verschiebt `saveReceiptImages` (bestehend, nimmt Pfade) sie zur Ausgabe; beim Verwerfen werden die Dateien gelöscht. Aufräumen verwaister Pending-Ordner in `pruneOrphanReceiptImages` mit aufnehmen.

### 3. Auftrags-Verwaltung — neu `utils/receiptLlm/pendingReceipts.ts` (Modul M08)
- `createPending(source, scanned)` → legt Zeile an (`queued`), sichert Bilder, startet `runScanAgent` (bestehend, `utils/receiptLlm/scanAgent.ts`, serialisiert bereits über `chain`).
- Schreibt Fortschritt/Zwischenwerte in einen kleinen In-Memory-Store (wie `agentActivity.ts`, `useSyncExternalStore`) für Live-Anzeige; Endergebnis in die Tabelle (`ready`/`failed`), Protokoll-Verknüpfung über `run_id`.
- Die Feldwahl, die heute in `ReceiptScanView.startAgent` steckt (Agent- vs. Regex-Artikel nach Abstand zur Summe, `toListItem`), wandert als reine Funktion hierher (`mergeAgentResult`) → testbar, von Ansicht und Hintergrund gleich genutzt.
- `acceptPending(id, overrides?)`: der heutige `save()`-Ablauf aus `ReceiptScanView.tsx:240-303` als Funktion (Ausgabe, Artikel, Bilder, `attachExpenseToRun`, `holdAutoSync`), danach Zeile löschen. Von Scan-Seite **und** Startseiten-Knopf „Freigeben“ genutzt. Freigabe ohne gültige Summe → nicht möglich, Kachel öffnet stattdessen die Scan-Seite.
- `discardPending(id)`: Zeile + Bilder löschen (Protokolleintrag bleibt).
- `skipPending(id)`: `skipped_at = now` → rutscht hinter die anderen.
- `resumePending()`: beim App-Start (in `components/LocalFirstInit.tsx`, wie `installAutoSync`) alle Zeilen mit `reading|queued|running` erneut in die Qwen-Kette stellen (Text ist gespeichert; `reading` ohne Text → `failed` mit „Bild erneut auswerten“).
- `usePendingReceipts()`: Liste sortiert: zuerst laufende, dann `ready/failed` nach neuestem `created_at`, ignorierte (`skipped_at`) ans Ende.
- `stopAgent` beim Verlassen der Ansicht entfällt; Abbruch nur noch ausdrücklich („Auswertung abbrechen“ in der Scan-Seite).

### 4. Status-Zeile und Hintergrund
- `beginActivity` schon beim Anlegen des Auftrags (Phase „Bon wird gelesen“), damit die Zeile auch während Texterkennung erscheint.
- `beginBackgroundWork` (`utils/backgroundWork.ts`) ebenfalls ab Auftragsbeginn statt erst in `runScanAgentNow` → Wegwischen der App während der Texterkennung ist abgedeckt.
- `components/AgentStatusBar.tsx`: Pfeil-Symbol links, Tipp öffnet den aktuellen Auftrag; ausgeblendet, solange die Scan-Seite sichtbar ist (nichts liegt über ihrem Pfeil). Per Portal an `document.body` und höchster z-Index, damit sie über Unteransichten liegt.
- `components/ReceiptScanView.tsx`: Kopf bekommt `pt-[max(env(safe-area-inset-top),1.5rem)]`.

### 5. Scan-Seite — `components/ReceiptScanView.tsx`
- Prop `pendingId` statt eigener Laufverwaltung: zeigt Bild/Felder/Artikel eines Auftrags, Live-Werte aus dem Store, Nutzer-Änderungen werden (gedrosselt) in `edits` gespeichert.
- Neuer Scan (Kamera/Galerie/Teilen) → `createPending` → Seite zeigt den neuen Auftrag. Zweiter geteilter Bon während einer Auswertung = einfach weiterer Auftrag (Warteschlange über `chain`).
- Zurück/Pfeil/Zurücktaste schließt immer nur die Ansicht; der Auftrag lebt weiter. Das Parken (`scannerParked`, `keepAliveNow`, `forceClose`) in `MobileDashboard.tsx`/`ReceiptScanView.tsx` entfällt.
- Knöpfe: „Speichern“ (= `acceptPending` mit Formularwerten), „Verwerfen“ (Sicherheitsabfrage), „Abbrechen“ während Qwen läuft.
- Nebenbei sinnvoll: die Datei schrumpft deutlich (Laufverwaltung raus) — der offene Punkt „ReceiptScanView mischt Anzeige und Ablauf“ erledigt sich.

### 6. Startseite — `components/MobileDashboard.tsx:650-653`, neue `components/PendingReceiptTile.tsx`
Ersetzt die Kachel „Ausgegeben“ dauerhaft (gleicher Platz im 2er-Raster; bei offenem Bon über beide Spalten, damit Laden, Datum, Summe und drei Knöpfe auf 375 px passen).
- Läuft Qwen: „Qwen wertet aus · Laden/„Bon“ · 41 s“ mit Ladeanzeige, Tipp → Scan-Seite.
- Offener Bon (neuester zuerst): Datum, Laden, Summe (Hinweis „bitte prüfen“, wenn Agent unsicher/Summe fehlt), Knöpfe **Freigeben** (primär), **Ignorieren**, **Verwerfen**; Zähler „1 von 3 offen“. Tipp auf die Kachel (außerhalb der Knöpfe) → Scan-Seite dieses Bons.
- **Verwerfen — eindeutige Sicherheitsabfrage:** Dialog (bestehender `components/ui/dialog`) „Bon von Lidl, 12,34 €, 05.10. endgültig verwerfen? Bild und erkannte Artikel werden gelöscht.“ mit „Verwerfen“ (rot) und „Abbrechen“ (Fokus-Standard).
- Keine offenen Bons: „Keine offenen Bons“ + Knopf „Bon scannen“.
- `MobileDashboard` hört auf `OPEN_SCANNER_EVENT` mit Auftrags-ID; `setScanNotice`-Logik entfällt (die Kachel übernimmt den Fertig-Hinweis; Status-Zeile zeigt kurz „Bon fertig – tippen zum Prüfen“).

### 7. KI-Protokoll öffnet nicht — Ursache und Behebung
Ursache (aus dem Code; vor der Änderung auf dem Handy per DevTools bestätigen): `.view-enter` (`app/globals.css:288-299`) läuft mit `both` und endet auf `transform: translateY(0)`. Ein Element mit `transform` wird Bezugsrahmen für `position: fixed`-Kinder → `AgentProtocolView` (`fixed inset-0`) klebt an den Anfang der gescrollten Einstellungs-Fläche, der Eintrag steht ganz unten → man sieht nichts. Gleiches Muster beim Modell-Labor.
- `app/globals.css`: `view-enter` mit `backwards` statt `both`.
- `AgentProtocolView`, `RunDetail`, `HarnessLab` per `createPortal(…, document.body)` rendern.
- Protokoll bekommt Verlaufseintrag (wie Scanner), Android-Zurücktaste schließt es.

## Dateien
- Neu: `utils/receiptLlm/pendingReceipts.ts` (+ Test), `components/PendingReceiptTile.tsx`
- Geändert: `utils/localdb.ts`, `utils/receiptImages.ts`, `utils/receiptLlm/scanAgent.ts`, `utils/receiptLlm/agentActivity.ts`, `components/ReceiptScanView.tsx`, `components/MobileDashboard.tsx`, `components/AgentStatusBar.tsx`, `components/AgentProtocolView.tsx`, `components/HarnessLabEntry.tsx`/`HarnessLab.tsx`, `components/LocalFirstInit.tsx`, `app/globals.css`, `utils/architecture.test.ts` (neue Datei M08 zuordnen), `docs/ARCHITEKTUR.md`
- Wiederverwendet: `runScanAgent`/`chain` (Serialisierung), `beginActivity`, `beginBackgroundWork`, `saveReceiptImages`, `attachExpenseToRun`, `holdAutoSync`, `itemsTotal`, `parsePrice`, `toIsoDay`, `parseAmountField`.

## Verifikation
- Vitest (fake-indexeddb, wie bestehende Tests): Auftrag anlegen → `ready`; Sortierung neuester zuerst, Ignorieren ans Ende; `acceptPending` legt Ausgabe+Artikel+Bilder an und löscht Zeile; `discardPending` löscht Zeile+Bilder; `resumePending` stellt `queued/running` erneut ein; Nutzer-`edits` bleiben beim Weiterrechnen erhalten; `mergeAgentResult` (Regex vs. Agent-Artikel).
- `tsc`, alle Tests (inkl. Architektur- und Netz-Audit), `next build`, `cap sync`, `gradlew assembleDebug`; `adb install -r` (Daten bleiben; Dexie v4 additiv) und Zählung der Tabellen vor/nach.
- Auf dem Handy: (1) Bon fotografieren, sofort Pfeil → Startseite zeigt laufende Kachel, Status-Zeile oben, Pfeil im Scanner nicht verdeckt. (2) App wegwischen (nicht schließen) → Benachrichtigung, Lauf endet, Kachel zeigt Bon. (3) Zwei Bons hintereinander → beide offen, neuester vorn; Ignorieren/Verwerfen (Abfrage) / Freigeben. (4) Kachel tippen → Scan-Seite, Feld ändern, zurück, Werte bleiben. (5) App während Lauf per `am force-stop` beenden, neu starten → rechnet weiter. (6) Einstellungen ganz nach unten, KI-Protokoll öffnet, Zurücktaste schließt.
- Abschluss: frischer Audit-Agent über die Änderung. Nichts wird committet.
