# Automatischer REWE-Ausgaben-Import

Liest REWE-eBon-Mails automatisch aus einem Gmail-Postfach und legt daraus Ausgaben
(Kategorie **Essen**) an — ohne KI, rein per IMAP + Regex/PDF-Text.

## Architektur

```
Einstellungen → REWE Import          Cron (Vercel, stündlich)
   E-Mail + App-Passwort                 │
   → saveEmailConnection()               ▼
     (IMAP-Testlogin, AES-256-GCM)   GET /api/rewe-sync  (CRON_SECRET)
     → Tabelle email_connections         │
                                         ▼  für jeden verbundenen User
                            lib/reweSync.ts → syncReweExpenses(userId)
                              ├─ utils/mailbox.ts        (IMAP: REWE-Mails holen)
                              ├─ utils/parseReweEmail.ts (Betrag + Datum)
                              ├─ Dedup via rewe_receipts (UNIQUE message_id)
                              └─ supabaseAdmin: expenses + rewe_receipts
```

Beteiligte Dateien: `utils/crypto.ts`, `utils/mailbox.ts`, `utils/parseReweEmail.ts`,
`lib/reweSync.ts`, `app/actions/emailConnection.ts`, `app/api/rewe-sync/route.ts`,
`components/SettingsOverlay.tsx`, Tabellen in `src/db/schema.ts` (Migration `drizzle/0002_rewe_email_import.sql`).

## Einrichtung

### 1. Env-Variablen setzen
`CRON_SECRET` und `CREDENTIALS_ENCRYPTION_KEY` in `.env` (siehe `.env.example`):

```
openssl rand -hex 32   # für CRON_SECRET
openssl rand -hex 32   # für CREDENTIALS_ENCRYPTION_KEY (einmalig, danach NIE ändern)
```

> **Wichtig:** Wird `CREDENTIALS_ENCRYPTION_KEY` nachträglich geändert, lassen sich bereits
> gespeicherte App-Passwörter nicht mehr entschlüsseln — Nutzer müssen sich dann neu verbinden.

### 2. Migration anwenden
Erzeugt die Tabellen `email_connections` und `rewe_receipts` (inkl. RLS-Policies).

- Per Drizzle: `npx drizzle-kit migrate`
- **oder** den Inhalt von `drizzle/0002_rewe_email_import.sql` direkt im Supabase-SQL-Editor ausführen.

### 3. Parser kalibrieren (empfohlen, vor dem Live-Betrieb)
`REWE_TEST_EMAIL` + `REWE_TEST_APP_PASSWORD` in `.env` setzen, dann:

```
npx tsx scripts/rewe-sync-test.ts
```

Der Dry-Run schreibt nichts in die DB, sondern zeigt pro gefundener Mail den erkannten
Betrag + Datum. Falls „NICHT ERKANNT" erscheint, die Regex-Muster bzw. Absender-Hinweise
in `utils/parseReweEmail.ts` / `utils/mailbox.ts` an das echte REWE-Format anpassen.

### 4. Postfach verbinden (App)
In der App: **Einstellungen → REWE Import** → Gmail-Adresse + App-Passwort → **Verbinden**.
Voraussetzungen im Google-Konto:
1. 2-Faktor-Authentifizierung aktiv.
2. App-Passwort erstellt unter `myaccount.google.com/apppasswords`.
3. In der REWE-App den digitalen **eBon per E-Mail** aktiviert (sonst kommen keine Mails).

### 5. Cron
`vercel.json` triggert `/api/rewe-sync` täglich um 06:00 UTC. Bei gesetztem `CRON_SECRET` schickt
Vercel Cron es automatisch als `Authorization: Bearer …`.

> **Vercel-Plan:** Der Hobby-(Free-)Plan erlaubt Cron nur **einmal täglich**. Für häufigere Läufe
> (z. B. stündlich `0 * * * *`) ist der **Pro-Plan** nötig. Für wenige Einkäufe pro Woche reicht täglich.

Ohne Vercel-Hosting stattdessen Supabase `pg_cron`+`pg_net` oder einen externen Cron auf dieselbe URL zeigen lassen.

Manueller Test:

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/rewe-sync
```

## Deduplizierung
`rewe_receipts.message_id` (RFC822 Message-ID der Mail) hat einen UNIQUE-Constraint und wird
**vor** dem Anlegen der Ausgabe geschrieben → dieselbe Mail kann nie doppelt gebucht werden,
auch nicht bei parallelen Läufen.

## Später (vorbereitet)
- **Einzelartikel** statt nur Gesamtbetrag: Tabelle `rewe_receipt_items` + erweitertes Parsing.
- **OAuth-Button** („Mit Google verbinden"): `provider='oauth'` in `email_connections`,
  OAuth-Branch in `utils/mailbox.ts`, Callback-Route. Rest bleibt unverändert.
