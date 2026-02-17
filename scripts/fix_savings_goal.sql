
-- Update the fixed cost for 'Neues Auto' savings goal to exactly 500
-- Also ensure it's calculated as a monthly cost (so title 'Sparziel: Neues Auto')
UPDATE fixed_costs 
SET amount = 500 
WHERE title LIKE '%Neues Auto%';

-- Verify the update
SELECT * FROM fixed_costs WHERE title LIKE '%Neues Auto%';
