import { calculateGirokontoTimeline } from '../utils/girokonto';
import { Expense, IncomeSource, FixedCost } from '../app/types';

// Mock Data
// Week 1: 2026-02-16 (Mon) to 2026-02-22 (Sun)
// Week 2: 2026-02-23 (Mon) to 2026-03-01 (Sun)

const monthlyIncome = 2000;
const monthlyFixed = 500;
const weeklyBucket = (monthlyIncome - monthlyFixed) / 4.33; // ~346.42

const mockIncome: IncomeSource[] = [
    {
        id: 1,
        title: 'Gehalt',
        amount: monthlyIncome,
        frequency: 'monthly',
        valid_from: '2026-01-01T00:00:00.000Z',
        user_id: 'user1'
    }
];

const mockFixedCosts: FixedCost[] = [
    {
        id: 1,
        title: 'Miete',
        amount: monthlyFixed,
        valid_from: '2026-01-01T00:00:00.000Z',
        user_id: 'user1'
    }
];

const mockExpenses: Expense[] = [
    {
        id: 1,
        amount: 100, // Monday expense
        description: 'Einkauf',
        expense_date: '2026-02-16T12:00:00.000Z',
        category: 'Essen',
        user_id: 'user1',
        created_at: '2026-02-16T12:00:00.000Z'
    },
    {
        id: 2,
        amount: 250, // Wednesday expense -> Total this week = 350. Bucket (346.42) is slightly overdrawn.
        description: 'Tank',
        expense_date: '2026-02-18T12:00:00.000Z',
        category: 'Sonstiges',
        user_id: 'user1',
        created_at: '2026-02-18T12:00:00.000Z'
    },
    {
        id: 3,
        amount: 50, // Monday next week
        description: 'Kino',
        expense_date: '2026-02-23T12:00:00.000Z',
        category: 'Freizeit',
        user_id: 'user1',
        created_at: '2026-02-23T12:00:00.000Z'
    }
];

console.log('Running Girokonto Simulation Test...');
console.log('--- EXPECTED BEHAVIOR ---');
console.log(`Weekly Bucket refills every Monday with: €${weeklyBucket.toFixed(2)}`);
console.log(`Week 1 Expenses (Mon-Sun): €350.00`);
console.log(`Week 1 Rollover (Sunday night): €${(weeklyBucket - 350).toFixed(2)} should be added to Girokonto`);
console.log(`Week 2 Expenses (Mon-Sun): €50.00`);
console.log(`Daily balances should show Girokonto remaining constant during the week, only updating Sunday.\n`);


const result = calculateGirokontoTimeline(mockExpenses, mockIncome, mockFixedCosts);

console.log('--- TIMELINE (From Feb 16 to Now) ---');

// Filter timeline to only show from Feb 16
const filterDate = new Date('2026-02-16T00:00:00.000Z');
result.timeline.filter(t => t.date >= filterDate).slice(0, 14).forEach(t => {
    const dayName = t.date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = t.date.toISOString().split('T')[0];
    console.log(`${dayName} ${dateStr} | Girokonto: €${t.balance.toFixed(2)}`);
});

console.log(`\nFinal Balance: €${result.finalBalance.toFixed(2)}`);
