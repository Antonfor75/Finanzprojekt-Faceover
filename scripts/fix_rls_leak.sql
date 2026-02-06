
-- 1. DROP INSECURE POLICIES
DROP POLICY IF EXISTS "policy_public_all_expenses" ON expenses;
DROP POLICY IF EXISTS "policy_public_all_fixed_costs" ON fixed_costs;
DROP POLICY IF EXISTS "policy_public_all_settings" ON settings;
DROP POLICY IF EXISTS "policy_public_all_accounts" ON accounts;
DROP POLICY IF EXISTS "Enable read access for all users" ON expenses;
DROP POLICY IF EXISTS "Enable insert for all users" ON expenses;

-- 2. ENSURE STRICT POLICIES (Re-create to be safe)

-- EXPENSES
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
CREATE POLICY "Users can view own expenses" ON expenses FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
CREATE POLICY "Users can insert own expenses" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
CREATE POLICY "Users can update own expenses" ON expenses FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
CREATE POLICY "Users can delete own expenses" ON expenses FOR DELETE USING (auth.uid() = user_id);

-- FIXED_COSTS
DROP POLICY IF EXISTS "Users can view own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can view own fixed_costs" ON fixed_costs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can insert own fixed_costs" ON fixed_costs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can update own fixed_costs" ON fixed_costs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can delete own fixed_costs" ON fixed_costs FOR DELETE USING (auth.uid() = user_id);

-- SETTINGS
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
CREATE POLICY "Users can view own settings" ON settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON settings;
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING (auth.uid() = user_id);

-- ACCOUNTS
DROP POLICY IF EXISTS "Users can view own accounts" ON accounts;
CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own accounts" ON accounts;
CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own accounts" ON accounts;
CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own accounts" ON accounts;
CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING (auth.uid() = user_id);
