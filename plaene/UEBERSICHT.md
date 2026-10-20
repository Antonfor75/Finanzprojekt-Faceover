# Pläne – Übersicht

Alle Pläne für Web-App, Handy-App „Mein Cashflow“ und Chefansicht liegen in diesem Ordner.

**Regel:** Bei jeder Arbeit an einem Plan wird diese Übersicht sofort angepasst. Neue Pläne werden hierher kopiert und verlinkt, und der Status wird nachgezogen (offen → halb ausgeführt → ausgeführt).

---

## Offen

- [Handy-App: offene Bons im Hintergrund](2026-10-08-handyapp-offene-bons.md) (Cashflow-AndroidApp): Die Qwen-Auswertung läuft weiter, auch wenn man die Scan-Ansicht verlässt. Fertige Bons bleiben als „offen“ gespeichert und lassen sich über eine Startseiten-Kachel freigeben, ignorieren oder verwerfen. Außerdem wird das KI-Protokoll repariert.

## Halb ausgeführt

- [Web-App: Kassenbon-Auswertung mit Gemini](2026-10-20-webapp-kassenbon-gemini.md) (Web + Chefansicht): Gebaut sind Scan-Ansicht, Startseiten-Kachel und Agent-Feld wie in der Handy-App, dazu Server Actions mit Gemini (Flash bis 60 s, danach Flash-Lite). Die Auswertung läuft auf dem Server weiter, auch bei ausgeschaltetem Bildschirm oder geschlossener Seite. Offene Bons liegen in `pending_receipts`, ihr Bild im privaten Bucket `receipt-scans`, beides wird beim Speichern oder Verwerfen gelöscht. Freischaltung je Konto über `app_metadata.receipt_scan`, Schalter in der Chefansicht-App und in `/admin`. Tests grün, Build grün. Migration 0010 ist live, `chef-admin` deployt, Chefansicht v0.1.4 per OTA und als APK ausgerollt.
  Seit 2026-10-20 live auf main (Commit 7a5abbf), `GEMINI_API_KEY` auf Vercel gesetzt, Testkonten freigeschaltet.
  Später am selben Tag: Flash-Lite liest zuerst, Flash prüft bei Summen-Fehlern nach (Messung `npm run eval:receipts`). Der REWE-E-Mail-Import ist komplett entfernt: Web-App (Code, Cron, Pakete), Handy-App (OTA 0.1.9) und Datenbank (Daten gelöscht, Tabellen per Migration 0011 gelöscht); Ausgaben und Artikel bleiben.
  Danach: Bons aus anderen Apps per „Teilen“ empfangen (Web Share Target, `share_target` im Manifest): Der Service Worker fängt den POST auf `/share-receipt` ab, legt die Dateien in IndexedDB und leitet auf `/?share=ok`; die Startseite holt sie ab, verkleinert sie und startet den Scan (nur freigeschaltete Konten, sonst Hinweis). Tests, Lint der geänderten Dateien und Build grün; Service-Worker-Pfad im Browser geprüft.
  **Fehlt noch:** ein echter Scan über die Live-Seite (auch per Teilen vom Handy, nur mit installierter PWA); danach echte Personen freischalten.

- [Web-App professionalisieren](2026-10-08-webapp-professionalisierung.md) (Web + Chefansicht): Impressum, Datenschutzerklärung, Datenschutz-Häkchen bei der Registrierung und „Konto löschen“ sind gebaut. Dazu kommen ein Demo-Modus unter `/demo` mit Beispieldaten nur im Browser und eine geführte Tour. Einladungscodes gelten jetzt für mehrere Personen, im Web-Admin und in der Chefansicht. Alles ist live (main, Migration 0008, Chef-APK installiert).
  **Fehlt noch:** eine echte Registrierung mit einem Mehrfach-Code, ein paralleler Einlöse-Test und der Live-Check, ob sich die Login-Seite scrollen lässt.

## Ausgeführt

- (noch keiner vollständig abgeschlossen)
