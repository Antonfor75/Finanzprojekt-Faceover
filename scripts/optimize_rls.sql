-- OPTIMIZE RLS POLICIES
-- Replaces auth.uid() with (select auth.uid()) to prevent per-row re-evaluation

-- EXPENSES
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
CREATE POLICY "Users can view own expenses" ON expenses FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
CREATE POLICY "Users can insert own expenses" ON expenses FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
CREATE POLICY "Users can update own expenses" ON expenses FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
CREATE POLICY "Users can delete own expenses" ON expenses FOR DELETE USING ((select auth.uid()) = user_id);


-- FIXED_COSTS
DROP POLICY IF EXISTS "Users can view own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can view own fixed_costs" ON fixed_costs FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can insert own fixed_costs" ON fixed_costs FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can update own fixed_costs" ON fixed_costs FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own fixed_costs" ON fixed_costs;
CREATE POLICY "Users can delete own fixed_costs" ON fixed_costs FOR DELETE USING ((select auth.uid()) = user_id);


-- ACCOUNTS
DROP POLICY IF EXISTS "Users can view own accounts" ON accounts;
CREATE POLICY "Users can view own accounts" ON accounts FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own accounts" ON accounts;
CREATE POLICY "Users can insert own accounts" ON accounts FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own accounts" ON accounts;
CREATE POLICY "Users can update own accounts" ON accounts FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own accounts" ON accounts;
CREATE POLICY "Users can delete own accounts" ON accounts FOR DELETE USING ((select auth.uid()) = user_id);


-- SETTINGS
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
CREATE POLICY "Users can view own settings" ON settings FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
CREATE POLICY "Users can insert own settings" ON settings FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON settings;
CREATE POLICY "Users can update own settings" ON settings FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own settings" ON settings;
CREATE POLICY "Users can delete own settings" ON settings FOR DELETE USING ((select auth.uid()) = user_id);


-- BUDGET_LOGS
DROP POLICY IF EXISTS "Users can view own budget logs" ON budget_logs;
CREATE POLICY "Users can view own budget logs" ON budget_logs FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own budget logs" ON budget_logs;
CREATE POLICY "Users can insert own budget logs" ON budget_logs FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own budget logs" ON budget_logs;
CREATE POLICY "Users can update own budget logs" ON budget_logs FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own budget logs" ON budget_logs;
CREATE POLICY "Users can delete own budget logs" ON budget_logs FOR DELETE USING ((select auth.uid()) = user_id);


-- INCOME_SOURCES
DROP POLICY IF EXISTS "Users can view own income sources" ON income_sources;
CREATE POLICY "Users can view own income sources" ON income_sources FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own income sources" ON income_sources;
CREATE POLICY "Users can insert own income sources" ON income_sources FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own income sources" ON income_sources;
CREATE POLICY "Users can update own income sources" ON income_sources FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own income sources" ON income_sources;
CREATE POLICY "Users can delete own income sources" ON income_sources FOR DELETE USING ((select auth.uid()) = user_id);
