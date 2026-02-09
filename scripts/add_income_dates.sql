
-- Migration to add validity dates to income_sources

ALTER TABLE income_sources 
ADD COLUMN IF NOT EXISTS valid_from timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE income_sources 
ADD COLUMN IF NOT EXISTS valid_to timestamp with time zone;

-- Optional: Update existing records to have a valid_from equal to their creation date (if created_at exists)
-- UPDATE income_sources SET valid_from = created_at WHERE valid_from IS NULL;
