-- RLS SETUP SCRIPT
-- RUN THIS IN SUPABASE DASHBOARD SQL EDITOR
-- This script secures your data and assigns existing data to you.

-- 1. ADD COLUMN user_id IF NOT EXISTS
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE fixed_costs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();

-- 2. BACKFILL EXISTING DATA
-- Assigns data without an owner to YOU (the user running this script).
UPDATE expenses SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE fixed_costs SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE accounts SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE settings SET user_id = auth.uid() WHERE user_id IS NULL;

-- 3. ENABLE RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 4. CLEANUP OLD POLICIES (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
DROP POLICY IF EXISTS "policy_public_all_expenses" ON expenses;

DROP POLICY IF EXISTS "Users can view own fixed_costs" ON fixed_costs;
DROP POLICY IF EXISTS "Users can insert own fixed_costs" ON fixed_costs;
DROP POLICY IF EXISTS "Users can update own fixed_costs" ON fixed_costs;
DROP POLICY IF EXISTS "Users can delete own fixed_costs" ON fixed_costs;
DROP POLICY IF EXISTS "policy_public_all_fixed_costs" ON fixed_costs;

DROP POLICY IF EXISTS "Users can view own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can insert own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON accounts;
DROP POLICY IF EXISTS "Users can delete own accounts" ON accounts;
DROP POLICY IF EXISTS "policy_public_all_accounts" ON accounts;

DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON settings;
DROP POLICY IF EXISTS "policy_public_all_settings" ON settings;

-- 5. CREATE NEW STRICT POLICIES

-- EXPENSES
CREATE POLICY "Users can view own expenses" ON expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own expenses" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own expenses" ON expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own expenses" ON expenses FOR DELETE USING (auth.uid() = user_id);

-- FIXED COSTS
CREATE POLICY "Users can view own fixed_costs" ON fixed_costs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fixed_costs" ON fixed_costs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fixed_costs" ON fixed_costs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fixed_costs" ON fixed_costs FOR DELETE USING (auth.uid() = user_id);

-- ACCOUNTS
CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING (auth.uid() = user_id);

-- SETTINGS
CREATE POLICY "Users can view own settings" ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON settings FOR DELETE USING (auth.uid() = user_id);
