-- REWE-E-Mail-Import eingestellt (2026-10-20): Code in Web-App und Handy-App entfernt,
-- Daten (1 Postfach, 18 Protokollzeilen) vorher gelöscht. Die Tabellen fallen weg.
-- Keine Fremdschlüssel, Views oder Funktionen hängen daran (geprüft); Ausgaben und
-- Bon-Artikel (expenses, receipt_items) bleiben unberührt. Policies, Indizes und die
-- Sequenzen der serial-Spalten verschwinden mit der Tabelle.
DROP TABLE IF EXISTS "email_connections";
--> statement-breakpoint
DROP TABLE IF EXISTS "rewe_receipts";
