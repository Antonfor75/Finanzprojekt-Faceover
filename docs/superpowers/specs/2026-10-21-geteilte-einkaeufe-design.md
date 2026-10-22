# Geteilte Einkäufe mit einem Freund – Design

Stand: 2026-10-21 · gilt für Web-App (dieses Repo) und Handy-App „Mein Cashflow“ (`C:\Anton\Cashflow-AndroidApp`)
UI-Entwürfe: https://claude.ai/artifact/BaYGrPP3PqZ6Kfh7swBhHz (gewählt: **A3, B4, C4, D1-Final, E1**)

## Worum es geht

Zwei Konten können sich verknüpfen und Einkäufe untereinander aufteilen. Wer einen Einkauf einträgt oder einen Kassenbon hochlädt, kann ihn mit dem Freund teilen. Dann steht bei jedem nur sein eigener Anteil als Ausgabe im Budget, und zwar sofort.

**Wichtig – kein Schuldenbuch.** Wenn eine Ausgabe geteilt ist, gilt das Geld als bereits verrechnet, so als hätte der Freund seinen Anteil schon bezahlt. Es gibt also keine offenen Beträge, kein „wer schuldet wem“ und kein Ausgleichen. Das hat der Nutzer ausdrücklich so entschieden.

## Ziele

1. **Kontoname.** Jedes Konto kann sich einen eindeutigen Kontonamen geben, z. B. `@anton`. Unter diesem Namen findet man sich gegenseitig.
2. **Freundschaft.** Man schickt eine Freundschaftsanfrage an einen Kontonamen. Jedes Konto hat **höchstens einen** Freund: höchstens eine angenommene Verbindung und, solange die offen ist, höchstens eine offene ausgehende Anfrage. So bleibt jede Teilung eindeutig.
3. **Teilen** einer Ausgabe mit dem Freund, auf zwei Arten:
   - **Nach Betrag:** Ein Balken mit verschiebbarer Grenze, also ein Prozentregler (Entwurf C4). Alternativ tippt man unter den Namen einen Betrag ein, die andere Seite bekommt automatisch den Rest. Voreinstellung ist 50/50.
   - **Nach Artikeln** (Entwurf D1-Final), nur wenn die Ausgabe Artikel hat (`receipt_items`): Anfangs liegen **alle Artikel auf der Seite der Person, die die Ausgabe eingetragen hat**. Tippt man einen Artikel an, schwimmt er animiert auf die andere Seite. Nochmal tippen schiebt ihn zurück. Was nicht verschoben wird, bleibt bei der eintragenden Person. Beide Summen rechnen live mit.
4. **Ergebnis bei beiden Personen.** Jeder hat eine ganz normale Ausgabe mit demselben Laden und Datum, aber mit **seinem eigenen Anteil** als Betrag.
   - Beim Teilen nach Artikeln bekommt jeder **nur seine Artikel** und deren Summe.
   - Beim Teilen nach Betrag bekommt der Freund keine Artikel, nur den Betrag.
   Bei jeder Ausgabe und jedem Artikel ist erkennbar, ob er geteilt war oder allein bezahlt wurde.
5. **Nachträglich teilen.** Im Verlauf tippt man eine Ausgabe an und kann sie dort teilen, die Teilung ändern oder aufheben (C4 als Fenster von unten).
6. **Teilen beim Eintragen.** Beim Eintragen einer Ausgabe und beim Speichern eines gescannten Kassenbons kann man direkt „mit <Freund> teilen“ wählen.
7. **Beide dürfen ändern.** Beide Personen dürfen eine geteilte Ausgabe ändern: Aufteilung, Betrag, Teilung aufheben, löschen. Die letzte Änderung gilt. Der andere sieht beim nächsten Abgleich einen Hinweis, dass etwas geändert wurde.
8. **Kennzeichnung im Verlauf** (E1):
   - Ein Hinweis „Geteilt mit <Name> · 50 %“ bzw. „· Artikel“, bei vom Freund eingetragenen Ausgaben „Von <Name> geteilt · 40 %“.
   - Der eigene Anteil steht groß, der Gesamtbetrag klein darunter („von 19,48 €“).
   - Alleine bezahlte Ausgaben bekommen keinen Hinweis.
9. **Anfrage senden (A3).**
   - Zwei Profilkreise sind mit einer gestrichelten Linie verbunden, darunter ein Suchfeld für den Kontonamen.
   - Beim Senden **fliegt eine Taube mit einem Brief im Schnabel** an der Linie entlang und verlässt den Bildschirm.
   - Danach zeigt der Status „Anfrage gesendet · wartet auf <Name>“. Die Anfrage lässt sich zurückziehen.
10. **Anfrage empfangen (B4).**
    - Wer eine Anfrage hat, bekommt beim nächsten Öffnen bzw. Abgleich einen Bildschirm „<Name> hat dir eine Taube geschickt“ mit gelandeter Taube und Briefumschlag.
    - Tippt man den Umschlag an, klappt er auf und der Brief schiebt sich heraus. Darunter stehen „Annehmen & verbinden“ und „Ablehnen“.
    - Bis man entschieden hat, zeigt die Startseite einen kleinen Hinweis bzw. Einstieg dazu.
11. **Verbindung trennen.** Die Verbindung lässt sich in den Einstellungen trennen. Bisherige geteilte Ausgaben bleiben bei beiden als normale Ausgaben mit ihrem Hinweis stehen. Sie lassen sich danach nicht mehr gemeinsam ändern, sondern nur noch jeweils die eigene Kopie.

## Nicht-Ziele

- Kein Schuldenstand, kein Ausgleichen, keine offenen Beträge (siehe oben).
- Keine Gruppen und nicht mehr als ein Freund.
- **Keine echten Push-Nachrichten.** Benachrichtigt wird beim Öffnen der App bzw. beim Abgleich, also kein Firebase und kein neues APK.
- Kein Ändern von Fixkosten oder Einnahmen über das Teilen, nur variable Ausgaben (`expenses`).
- Keine Änderung an der Chefansicht-App.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Budget-Zahlen stimmen nicht mehr mit der täglichen Girokonto-Rechnung überein (RULES.md). Der eigene Anteil muss als ganz normale Ausgabe in `utils/girokonto.ts` einfließen. Es darf keine parallele Rechnung geben.
- Ein Konto kann Daten eines fremden Kontos lesen oder schreiben, mit dem es nicht verbunden ist (RLS!).
- Die Handy-App geht außerhalb des erlaubten Abgleichs ins Internet (Netz-Riegel `utils/networkGate.ts`).
- Doppelte oder verwaiste Ausgaben beim Freund, z. B. nach mehrfachem Abgleich oder nach Löschen.
- Die Taube oder das Schwimmen ruckelt oder fehlt: Die Animationen sind ausdrücklich Teil des Wunsches.

## Rahmenbedingungen aus dem Bestand

- **Datenbank:**
  - Supabase/Postgres. Jede Tabelle ist per `user_id` und RLS auf das eigene Konto beschränkt.
  - `expenses.amount` ist `numeric` (kommt als String zurück), `expense_date` ist Text.
  - Artikel liegen in `receipt_items` (`expense_id`, `name_raw`, `total_price`, …).
  - Migrationen werden **von Hand** geschrieben (siehe Memory: `drizzle-kit generate` nicht benutzen). Neue Tabellen brauchen explizite GRANTs für `service_role` und ein Neuladen des Schemas.
- **Web-App:** Server Actions unter `app/actions/`, Verlauf in `components/CalendarHistory.tsx`, Eintragen in `components/AddExpenseForm.tsx`, Kassenbon-Speichern in `components/receipt/` bzw. `app/actions/receiptScan.ts`.
- **Handy-App:**
  - Arbeitet **local-first**: Dexie/IndexedDB in `utils/localdb.ts`, Sync in `utils/sync.ts` und `utils/syncCore.ts`, automatischer Abgleich bei Verbindung in `utils/autoSync.ts`.
  - Der Supabase-Client ist eine Fassade über Dexie (`utils/localFirstClient.ts`), der echte Client heißt `supabaseRemote`.
  - Internet ist nur innerhalb von `withNetwork(...)` erlaubt.
  - Auslieferung per OTA (`/push-local-app`).
- Die UI-Texte sind deutsch. Gestaltet wird nach DESIGN.md: Theme-Variablen statt fester Farben, starke Rundungen, mobil zuerst.

## Was entschieden ist (vom Nutzer)

| Thema | Entscheidung |
|---|---|
| Freunde pro Konto | genau einer |
| Geld | Teilen = sofort verrechnet, jeder hat nur seinen Anteil im Budget, kein Ausgleich |
| Benachrichtigung | beim Öffnen/Abgleich, keine Push-Nachricht |
| Wer darf ändern | beide, letzte Änderung gilt, der andere bekommt einen Hinweis |
| Handy-App | Teilen-Funktion wird nur mit Internet geladen/aktualisiert und gleicht sich automatisch ab, sobald eine Verbindung besteht |
| Entwürfe | A3 (Anfrage + Taube), B4 (Brief öffnen), C4 (Balken, nachträglich aus dem Verlauf), D1-Final (alles startet bei mir, Antippen schiebt rüber), E1 (Hinweis im Verlauf) |
| Artikel von Handy-Bons | dürfen online, **aber nur bei Bons, die nach Artikeln geteilt werden**, und erst beim Teilen. Alle anderen Bons bleiben wie bisher nur auf dem Handy (`PUSH_EXCLUDED_TABLES` bleibt bestehen). |
| Abgeschlossene Wochen | Kein Extra-Baustein. Alles Sichtbare (Girokonto, Wochenübersicht, Analyse) rechnet sich ohnehin bei jeder Änderung aus den Ausgaben neu, auch für alte Wochen. Der interne Wochenrest-Speicher `settings.savings_balance` wird in der App nicht angezeigt und bleibt unverändert. Ein Test belegt, dass Teilen in einer alten Woche das Girokonto beider Personen korrekt ändert. |

### Artikel von Handy-Bons online – was dabei zu beachten ist

- Der Upload läuft am normalen Sync vorbei, und zwar nur für die Artikel genau dieses Bons. Er passiert im selben Aufruf wie das Teilen und innerhalb von `withNetwork(...)`.
- **Keine doppelten Artikel beim Eintragenden.** Die Handy-App hält die Original-Artikel unter negativen lokalen IDs, und `pullAll()` räumt nur IDs ≥ 0 auf. Kommen die Artikel vom Server zurück, müssen die lokalen Originale ersetzt oder umgeschlüsselt werden statt dupliziert.
- **Verknüpfungen bleiben erhalten.**
  - Was an der lokalen Ausgabe oder den lokalen Artikeln hängt, darf seine Verbindung nicht verlieren. Das betrifft das Bonbild (`receipt_images`, gerätelokal), die Preis- und Rabattdaten (`item_enrichment`) und die Kategorien (`articles`).
  - Die Aufräumlogik für verwaiste Bonbilder darf das Bild eines geteilten Bons nicht löschen.
  - Die Ausgabe des Eintragenden behält ihre ID: Der Server ändert sie, statt sie neu anzulegen.
- Die Artikel, die der Freund herunterlädt, laufen bei ihm durch die normale Artikel-Analyse und -Einordnung wie eigene Artikel.
- „Teilung aufheben“ und Löschen entfernen die online liegenden Artikel wieder vom Server, soweit sie nur wegen des Teilens dort lagen. Beim Eintragenden bleiben sie lokal erhalten.

## Calls, die ich (Claude) getroffen habe – zum Gegenlesen

1. **Datenmodell: eine gemeinsame „Teilung“ als Quelle der Wahrheit, daraus je eine Ausgabe pro Person.**
   Neue Tabelle `shared_purchases` (gehört beiden Personen der Freundschaft, nicht nur einem Konto). Sie speichert:
   - Laden/Beschreibung, Datum, Gesamtbetrag
   - Modus (`percent` | `amount` | `items`) mit Prozent bzw. Beträgen
   - beim Modus `items` die vollständige Artikelliste mit Zuordnung (wer bekommt welchen Artikel)
   - wer sie angelegt hat, wer zuletzt geändert hat und wann

   Bei jeder Änderung schreibt der Server beide Ausgaben neu, je eine `expenses`-Zeile pro Person, plus deren `receipt_items`.
   - Die Ausgaben bekommen neue Spalten: `shared_purchase_id` und einen Grund-Hinweis für die Anzeige (Anteil in Prozent, Gesamtbetrag, Name des Freundes zum Zeitpunkt der Teilung).
   - `receipt_items` bekommen `shared_purchase_id`, damit auch jeder Artikel als geteilt erkennbar ist.

   Warum so: Beide dürfen ändern, und beim Teilen nach Artikeln muss die ganze Liste für beide verfügbar sein, um Artikel hin- und herzuschieben. Die einzelnen Kopien allein reichen dafür nicht.
2. **Schreiben ins fremde Konto nur über den Server**, nie direkt vom Client:
   - Postgres-Funktionen mit `SECURITY DEFINER` (bzw. Server Actions mit Admin-Client in der Web-App) prüfen, dass eine angenommene Freundschaft besteht.
   - Sie legen dann beide Ausgaben an, ändern oder löschen sie.
   - Die Handy-App ruft dieselben Funktionen (RPC) über `supabaseRemote` in `withNetwork(...)` auf.
   - Die Wahl zwischen RPC und Edge Function bleibt dem Builder, solange Web und Handy denselben Weg nutzen.
3. **Teilen braucht in der Handy-App Internet.** Ohne Verbindung sind die Teilen-Knöpfe deaktiviert und zeigen „Teilen braucht Internet“. Die Ausgabe lässt sich trotzdem allein speichern und später aus dem Verlauf teilen. Es gibt keine Teilen-Warteschlange in der Outbox.
   - Lokal angelegte Ausgaben mit negativer Temp-ID müssen erst hochgeladen sein, bevor sie geteilt werden. Das Teilen löst deshalb zuerst einen Abgleich aus.
4. **Geteilte Ausgaben sind in der Handy-App lokal schreibgeschützt.** Sie lassen sich nur über den Teilen-Dialog ändern, und der geht online zum Server. Der nächste Abgleich holt dann beide Seiten neu.
   - Normales Bearbeiten oder Löschen einer geteilten Ausgabe im Verlauf führt in den Teilen-Dialog bzw. fragt „Für beide löschen?“.
5. **Löschen einer geteilten Ausgabe löscht sie bei beiden**, nach Rückfrage. „Teilung aufheben“ gibt den ganzen Betrag und alle Artikel der Person zurück, die die Ausgabe ursprünglich eingetragen hat, und löscht die Kopie beim Freund.
6. **Hinweis „geändert/neu“:** Die Ausgabe des Freundes bekommt ein Merkmal „ungesehen“, solange er sie nach einer Änderung nicht geöffnet hat. Im Verlauf erscheint dann ein kleiner Punkt und beim Öffnen der App ein Banner „Anton hat 2 geteilte Ausgaben eingetragen/geändert“. Freundschaftsanfragen bekommen den B4-Brief.
7. **Kontoname:** 3–20 Zeichen, nur Kleinbuchstaben, Ziffern, `.` und `_`. Er ist eindeutig, Groß- und Kleinschreibung zählt nicht. Er ist änderbar, solange keine Freundschaft besteht. Er dient zugleich als Anzeigename. Liegt in einer neuen Tabelle `profiles` (`user_id`, `handle`).
   - Die Suche findet nur **exakte** Namen, nicht jeden Teiltreffer. So kann man nicht alle Nutzer durchblättern (Datenschutz).
8. **Geld in Cent rechnen.** Bei Prozent- oder Betragsteilung wird der Anteil des Freundes auf Cent gerundet, und die eintragende Person bekommt den Rest. So ergibt die Summe immer exakt den Gesamtbetrag.
   - Die Teilungs-Mathematik kommt als pure, getestete Funktion nach `utils/` und wird in beiden Repos identisch verwendet.
9. **Kategorie:** Die Kopie beim Freund übernimmt die Kategorie der Original-Ausgabe. Spar- oder Konto-Ausgaben (`account:<id>`, `Konto: …`) und Umbuchungen (`transfer_id`) lassen sich nicht teilen.
10. **Animationen:**
    - Taube (A3) und Brief (B4) laufen per CSS-Keyframes. Wer im Gerät „Bewegung reduzieren“ eingestellt hat, bekommt eine kurze Überblendung statt des Flugs.
    - Das Schwimmen der Artikel (D1-Final) soll aus der tatsächlichen Position heraus starten: FLIP-Technik oder eine kleine Bibliothek, z. B. `motion`, falls schon passend. Die Wahl bleibt beim Builder, solange es auf einem Mittelklasse-Android flüssig läuft.

## Was dem Builder überlassen bleibt

- Genaue Tabellen- und Spaltennamen, Indizes und RLS-Policies im Detail. Pflicht ist nur: Jeder sieht nur, was zu seiner eigenen Freundschaft gehört.
- RPC oder Edge Function (siehe Call 2).
- Wo der Einstieg „Freund verknüpfen“ sitzt: Einstellungen ist naheliegend.
- Komponentenschnitt und gemeinsame Teile zwischen Web und Handy-App. Die beiden Repos bleiben getrennt, Code wird gespiegelt wie bisher.
- Wie der Dexie-Schema-Stand der Handy-App für die neuen Spalten bzw. Tabellen hochgezogen wird.
- Testumfang über die Pflicht hinaus. Pflicht sind Unit-Tests der Teilungs-Mathematik, Tests der Server-Funktionen (Rechte: Fremde dürfen nichts) und ein E2E-Ablauf in der Web-App: Anfrage, annehmen, teilen, beide sehen ihren Anteil.

## Erfolg

- **Anfrage:** Zwei Testkonten verbinden sich. Die Taube fliegt beim Senden, beim Empfänger erscheint der Brief.
- **Nach Artikeln:**
  - Ein Kassenbon mit 8 Artikeln wird nach Artikeln geteilt.
  - Bei beiden stehen nur die eigenen Artikel, die Summen ergeben zusammen genau den Bon.
  - Die Wochenbudgets beider Konten sinken genau um den jeweiligen Anteil.
- **Ändern von beiden Seiten:**
  - Der Freund ändert die Teilung in der Handy-App.
  - Nach dem automatischen Abgleich sieht die andere Person in der Web-App die neuen Beträge und einen Hinweis.
- **Offline:** Die Handy-App funktioniert wie bisher. Das Teilen ist deaktiviert, und sobald wieder Internet da ist, gleicht alles ohne Knopfdruck ab.
