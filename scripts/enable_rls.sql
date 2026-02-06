-- AUTH: Enable RLS on tables

-- 1. Add user_id column
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE fixed_costs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() NOT NULL;

-- Add Foreign Key Constraints (Optional)
-- ALTER TABLE expenses ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id);


-- 2. Enable Row Level Security
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;


-- 3. Create Policies

-- EXPENSES
CREATE POLICY "Users can view own expenses" ON expenses 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses" ON expenses 
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses" ON expenses 
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses" ON expenses 
FOR DELETE USING (auth.uid() = user_id);


-- FIXED_COSTS
CREATE POLICY "Users can view own fixed_costs" ON fixed_costs 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fixed_costs" ON fixed_costs 
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fixed_costs" ON fixed_costs 
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own fixed_costs" ON fixed_costs 
FOR DELETE USING (auth.uid() = user_id);


-- SETTINGS
CREATE POLICY "Users can view own settings" ON settings 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON settings 
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON settings 
FOR UPDATE USING (auth.uid() = user_id);

-- ACCOUNTS
CREATE POLICY "Users can view own accounts" ON accounts 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts" ON accounts 
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts" ON accounts 
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts" ON accounts 
FOR DELETE USING (auth.uid() = user_id);
