-- Bon-Text des REWE-eBons: die Handy-App wertet ihn lokal mit dem Sprachmodell aus.
ALTER TABLE "rewe_receipts" ADD COLUMN IF NOT EXISTS "raw_text" text;
