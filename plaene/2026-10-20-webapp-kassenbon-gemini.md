# Web-App: Kassenbon-Auswertung mit Gemini (nur für freigeschaltete Personen)

> **Stand 2026-10-20: halb ausgeführt.** Abweichend vom ersten Entwurf (Abschnitt 6) gibt es jetzt doch
> **offene Bons wie in der Handy-App**: Tabelle `pending_receipts` + privater Storage-Bucket `receipt-scans`.
> Das Bild bleibt nur, solange der Bon offen ist, und wird beim Speichern oder Verwerfen gelöscht.
> Freigeschaltet wird in der **Chefansicht-App** (Aktion `setReceiptScan` in `chef-admin`) und zusätzlich in `/admin`.
> Gebaut: `app/actions/receiptScan.ts`, `utils/receiptScan/*`, `components/receipt/*`, `lib/receiptScanStorage.ts`,
> Migration `drizzle/0010_pending_receipts.sql` (+ `scripts/apply-0010-pending-receipts.mjs`), Datenschutz-Abschnitt.
> **Erledigt 2026-10-20:** Migration 0010 live, `chef-admin` deployt, Chefansicht v0.1.4 (OTA + APK).
> **Live seit 2026-10-20** (main 7a5abbf, Key auf Vercel). Ein Testbon (Lidl) wurde lokal geprüft: Flash las alles richtig, Flash-Lite verrutschte Preise.
> **Offen:** echter Scan über die Live-Seite, danach echte Personen freischalten.

**Ziel:** Die Web-App bekommt denselben Bon-Ablauf wie die Handy-App „Mein Cashflow“:
Foto/Bild/PDF → Auswertung → Prüfen & Korrigieren → Speichern als Ausgabe mit Artikeln.
Statt ML Kit + Qwen auf dem Gerät liest **Google Gemini (AI Studio, kostenloser Plan)** den Bon in einem einzigen Aufruf.
Die Funktion ist **nur für ausgewählte Konten** sichtbar und nutzbar.

**Vorbild (Handy-App, `C:\Anton\Cashflow-AndroidApp`):**
`components/ReceiptScanView.tsx` (Ablauf + Prüf-Ansicht), `utils/receiptLlm/pendingReceipts.ts` (`acceptPending` = Speichern, `RECEIPT_CATEGORIES`),
`utils/receiptLlm/validate.ts` (Plausibilitätsprüfung, Nicht-Artikel-Filter), `components/DiscardReceiptDialog.tsx`.

---

## 1. Reicht der kostenlose Plan?

| | Wert (Stand Okt. 2026, laut Drittquellen – in AI Studio unter „Rate limits“ nachsehen) |
|---|---|
| Gemini Flash (3.x) | ca. **20 Anfragen/Tag**, Pro-Modelle gar nicht mehr kostenlos |
| Gemini Flash-Lite | ca. **500–1.000 Anfragen/Tag**, ~15 pro Minute |
| Ein Bon | **1 Anfrage**, ~1.500–3.000 Token (Bild + Antwort) → Token-Limit spielt keine Rolle |
| Zurücksetzen | täglich um Mitternacht pazifischer Zeit (≈ 9 Uhr deutscher Zeit) |
| Gilt für | das **Google-Projekt**, nicht pro Person – alle Freigeschalteten teilen sich das Kontingent |

**Fazit:** Für wenige Personen mit je 1–5 Bons am Tag reicht es klar. Flash-Lite allein trägt mehrere hundert Bons täglich.
Flash (genauer bei schlechten Fotos) reicht für etwa 20 Bons am Tag. Deshalb: **zuerst Flash, bei „Kontingent erschöpft“ (HTTP 429) automatisch Flash-Lite.**

**Datenschutz:** Eigentlich darf Google Eingaben im kostenlosen Plan zum Training nutzen und Menschen lesen lassen.
Für Nutzer in EWR/Schweiz/UK gelten laut Gemini-API-Bedingungen aber die Regeln des bezahlten Plans, also **kein Training mit den Daten**.
Trotzdem gehen Bonbilder an Google → Datenschutzerklärung ergänzen (siehe Schritt 7).

## 2. Freischaltung nur für bestimmte Konten

**Ein Merker in `app_metadata` des Supabase-Kontos:** `{"receipt_scan": true}`.

- `app_metadata` kann **nur der Server mit Service-Role-Schlüssel** ändern, nicht der Nutzer selbst. `user_metadata` wäre falsch, das kann jeder Nutzer per Browser selbst setzen.
- Keine neue Tabelle, keine Migration.
- **Prüfung an zwei Stellen:**
  1. **Server (entscheidend):** Jede Bon-Server-Action holt `supabase.auth.getUser()` (frisch vom Auth-Server, nicht aus dem Cookie) und bricht ohne Merker mit „Diese Funktion ist für dein Konto nicht freigeschaltet.“ ab.
  2. **Oberfläche (nur Komfort):** Den Knopf „Bon scannen“ zeigt die App nur, wenn `session.user.app_metadata.receipt_scan === true`.
- **Ein- und Ausschalten:**
  - Sofort, ohne Code: im Supabase-SQL-Editor
    `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"receipt_scan": true}' where email = '…';`
  - Komfortabel: Schalter „Kassenbon-Scan“ je Nutzer in `app/admin` → neue Action `setReceiptScan(userId, on)` in `app/actions/admin.ts` mit `supabaseAdmin.auth.admin.updateUserById(id, { app_metadata: { receipt_scan: on } })`, abgesichert wie die übrigen Admin-Actions (`utils/adminGuard.ts`).
- Hinweis: Im Browser-Login steht der neue Merker erst nach der nächsten Token-Erneuerung (≤ 1 Std.) oder einem erneuten Login. Der Server prüft sofort.

## 3. Gemini anbinden (nur serverseitig)

- Neue Umgebungsvariable `GEMINI_API_KEY` (lokal in `.env`, auf Vercel unter Environment Variables). **Niemals** als `NEXT_PUBLIC_…`.
- Paket `@google/genai` (oder direkter `fetch` auf die REST-API, dann ohne neue Abhängigkeit).
- Neue Datei `utils/receiptGemini.ts`:
  - `extractReceipt(file: { mimeType, base64 })` → ein Aufruf mit Bild **oder PDF** (Gemini liest PDFs direkt), `responseMimeType: 'application/json'` und festem `responseSchema`:
    `{ laden, datum (JJJJ-MM-TT), summe, kategorie (eine aus RECEIPT_CATEGORIES), artikel: [{ name, menge, einheit, einzelpreis, preis }] }`
  - Prompt auf Deutsch, angelehnt an die Handy-App: Pfand/Rabatt als negative Zeilen, Summen-, Zahlungs- und Steuerzeilen sind keine Artikel.
  - Modellreihenfolge in einer Konstante: `['gemini-flash-latest', 'gemini-flash-lite-latest']`; bei 429 das nächste Modell nehmen. Sind alle erschöpft: „Das Tageskontingent ist aufgebraucht – morgen ab ca. 9 Uhr wieder.“
  - Zeitlimit ~30 s.
- **Prüfung danach:** `validate.ts` der Handy-App als reine Funktion nach `utils/receiptValidate.ts` übernehmen (Nicht-Artikel-Filter, Summenabgleich, Datum nicht in der Zukunft, Betrag > 0) und mit Vitest-Tests absichern (Projektregel: reine Logik testen).

## 4. Server Actions (`app/actions/receiptScan.ts`)

- `scanReceipt(formData)` → Merker prüfen → Datei lesen (nur `image/*` oder `application/pdf`, max. 4 MB) → `extractReceipt` → `validate` → Ergebnis an die Oberfläche. **Nichts wird gespeichert**, das Bild verlässt den Server nur Richtung Google.
- `saveScannedReceipt({ store, amount, date, category, items })` → Merker prüfen → wie `acceptPending` der Handy-App:
  1. `expenses` einfügen (`description` = Laden, `expense_date` auf 12:00 normalisiert, `category`),
  2. `receipt_items` einfügen (`source` = erkannter Laden-Kürzel wie `rewe`/`kaufland`/`lidl`, sonst `scan`, damit `PurchasesTab` das Laden-Logo zeigt),
  3. `revalidatePath('/')`.
- Upload-Größe: Bilder **im Browser vorher verkleinern** (längste Kante 1.600 px, JPEG ~0,8 → meist < 500 KB). So bleibt es unter dem Standard-Limit von 1 MB für Server Actions. Für PDFs zusätzlich `experimental.serverActions.bodySizeLimit: '4mb'` in `next.config.ts`.

## 5. Oberfläche (`components/ReceiptScanView.tsx`, Web-Variante)

Aufbau und Texte wie in der Handy-App, Stil nach `DESIGN.md` (keine festen Farben, `rounded-3xl`, Glas-Optik):
- **Start:** „Bon fotografieren“ (`<input type="file" accept="image/*" capture="environment">`, öffnet am Handy die Kamera) und „Bild oder PDF wählen“.
- **Lesen:** Ladeanzeige „Bon wird gelesen …“ (meist 3–10 s).
- **Prüfen:** Laden, Gesamtbetrag groß, Datum, Kategorie, Artikelliste (Name/Preis bearbeitbar, löschen). Hinweis bei Abweichung Artikelsumme ↔ Gesamtbetrag (> 0,02 €). Hinweis „vom Agenten erkannt“ an übernommenen Feldern.
- **Aktionen:** Speichern, Verwerfen (mit `DiscardReceiptDialog`), „Weiteren Bon scannen“.
- **Einstieg:** Knopf in `MobileDashboard` (z. B. neben „Ausgabe hinzufügen“), nur bei gesetztem Merker. Nach dem Speichern `onUpdate(['expenses','receipts'])`.
- Die Ansicht wird erst bei Bedarf geladen (`next/dynamic`), damit das Startpaket nicht wächst (siehe Performance-Umbau).

## 6. Bewusste Unterschiede zur Handy-App

- **Keine Hintergrund-„offenen Bons“** in Ausbaustufe 1: Gemini antwortet in Sekunden, nicht in Minuten wie Qwen. Optional später: offene Bons im `localStorage` mit Startseiten-Kachel (wie `PendingReceiptTile.tsx`).
- **Keine Bonbilder gespeichert** (Datenschutz, kein Speicherplatz in Supabase nötig).
- Kein Teilen-Empfang aus anderen Apps; stattdessen lassen sich PDFs direkt auswählen.

## 7. Recht & Doku

- `app/datenschutz/page.tsx`: Abschnitt „Kassenbon-Scan (nur für freigeschaltete Konten)“: Bild/PDF geht zur Auswertung an Google (Gemini API), wird nicht gespeichert, gespeichert werden nur Ausgabe und Artikel.
- Kurzer Hinweis unter dem Scan-Knopf: „Der Bon wird zur Auswertung an Google Gemini geschickt.“
- `CLAUDE.md`: ein Satz zu `GEMINI_API_KEY` und zum `app_metadata.receipt_scan`-Merker.

## 8. Tests

- Vitest: `receiptValidate` (Nicht-Artikel, Summenabgleich, negative Pfandzeilen), Antwort-Umwandlung Gemini → Felder, Modell-Wechsel bei 429 (Gemini-Aufruf gemockt).
- Vitest: Server Action lehnt Konto **ohne** Merker ab und lehnt einen Merker in `user_metadata` ab.
- Von Hand: echter REWE- und Kaufland-Bon (Foto + PDF) mit freigeschaltetem Konto. Danach mit nicht freigeschaltetem Konto: Knopf fehlt, direkter Action-Aufruf scheitert.

## Reihenfolge

1. API-Schlüssel in AI Studio anlegen, Limits dort ablesen, `GEMINI_API_KEY` lokal + Vercel setzen.
2. `utils/receiptValidate.ts` + Tests.
3. `utils/receiptGemini.ts` + Tests (gemockt), danach einmal mit echtem Bon.
4. Server Actions mit Merker-Prüfung + Tests.
5. Oberfläche + Einstieg im Dashboard.
6. Admin-Schalter (oder vorerst SQL).
7. Datenschutz + CLAUDE.md, dann live (`/push-web-app`).

## Offene Fragen

- Welche Konten bekommen den Merker? (E-Mail-Adressen)
- Ausbaustufe 1 ohne „offene Bons“ in Ordnung, oder soll das gleich mit rein?
- Admin-Schalter auch in der Chefansicht-App (Edge Function `chef-admin`) oder reicht die Web-Admin-Seite?
