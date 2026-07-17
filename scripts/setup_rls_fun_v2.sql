-- RLS für Spaßkonto v2 (fun_accounts_v2, fun_groups, fun_group_expenses,
-- fun_income_entries) sowie fuer die bereits bestehende account_transactions-
-- Tabelle, die bisher ohne RLS lief. Gleiches Muster wie scripts/setup_rls.sql.

ALTER TABLE fun_accounts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fun_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fun_group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fun_income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own fun_accounts_v2" ON fun_accounts_v2;
DROP POLICY IF EXISTS "Users can insert own fun_accounts_v2" ON fun_accounts_v2;
DROP POLICY IF EXISTS "Users can update own fun_accounts_v2" ON fun_accounts_v2;
DROP POLICY IF EXISTS "Users can delete own fun_accounts_v2" ON fun_accounts_v2;
CREATE POLICY "Users can view own fun_accounts_v2" ON fun_accounts_v2 FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fun_accounts_v2" ON fun_accounts_v2 FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fun_accounts_v2" ON fun_accounts_v2 FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fun_accounts_v2" ON fun_accounts_v2 FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own fun_groups" ON fun_groups;
DROP POLICY IF EXISTS "Users can insert own fun_groups" ON fun_groups;
DROP POLICY IF EXISTS "Users can update own fun_groups" ON fun_groups;
DROP POLICY IF EXISTS "Users can delete own fun_groups" ON fun_groups;
CREATE POLICY "Users can view own fun_groups" ON fun_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fun_groups" ON fun_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fun_groups" ON fun_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fun_groups" ON fun_groups FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own fun_group_expenses" ON fun_group_expenses;
DROP POLICY IF EXISTS "Users can insert own fun_group_expenses" ON fun_group_expenses;
DROP POLICY IF EXISTS "Users can update own fun_group_expenses" ON fun_group_expenses;
DROP POLICY IF EXISTS "Users can delete own fun_group_expenses" ON fun_group_expenses;
CREATE POLICY "Users can view own fun_group_expenses" ON fun_group_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fun_group_expenses" ON fun_group_expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fun_group_expenses" ON fun_group_expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fun_group_expenses" ON fun_group_expenses FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own fun_income_entries" ON fun_income_entries;
DROP POLICY IF EXISTS "Users can insert own fun_income_entries" ON fun_income_entries;
DROP POLICY IF EXISTS "Users can update own fun_income_entries" ON fun_income_entries;
DROP POLICY IF EXISTS "Users can delete own fun_income_entries" ON fun_income_entries;
CREATE POLICY "Users can view own fun_income_entries" ON fun_income_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fun_income_entries" ON fun_income_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fun_income_entries" ON fun_income_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fun_income_entries" ON fun_income_entries FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own account_transactions" ON account_transactions;
DROP POLICY IF EXISTS "Users can insert own account_transactions" ON account_transactions;
DROP POLICY IF EXISTS "Users can update own account_transactions" ON account_transactions;
DROP POLICY IF EXISTS "Users can delete own account_transactions" ON account_transactions;
CREATE POLICY "Users can view own account_transactions" ON account_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own account_transactions" ON account_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own account_transactions" ON account_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own account_transactions" ON account_transactions FOR DELETE USING (auth.uid() = user_id);
