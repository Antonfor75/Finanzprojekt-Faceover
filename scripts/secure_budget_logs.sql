-- RLS for budget_logs

-- 1. ENABLE RLS
ALTER TABLE budget_logs ENABLE ROW LEVEL SECURITY;

-- 2. CREATE POLICIES
DROP POLICY IF EXISTS "Users can view own budget logs" ON budget_logs;
CREATE POLICY "Users can view own budget logs" ON budget_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own budget logs" ON budget_logs;
CREATE POLICY "Users can insert own budget logs" ON budget_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own budget logs" ON budget_logs;
CREATE POLICY "Users can update own budget logs" ON budget_logs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own budget logs" ON budget_logs;
CREATE POLICY "Users can delete own budget logs" ON budget_logs FOR DELETE USING (auth.uid() = user_id);
