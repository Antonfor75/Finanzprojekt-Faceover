import * as fs from 'fs';
import { startOfWeek, endOfWeek, addDays, subYears, format, isSameDay } from 'date-fns';

const RawData = JSON.parse(fs.readFileSync('./scripts/userdata.json', 'utf8'));
const expenses = RawData.expenses;
const incomeSources = RawData.incomeSources;
const fixedCosts = RawData.fixedCosts;

const originalDate = Date;
class MockDate extends Date {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super('2026-04-11T16:50:31+02:00'.replace('+02:00','Z'));
    } else {
      super(...args as []);
    }
  }
}
// @ts-ignore
global.Date = MockDate;
global.Date.now = () => new originalDate('2026-04-11T14:50:31Z').getTime();

const CONST_WEEKS_PER_MONTH = 4.33;

function calculate(expenses: any[], incomeSources: any[], fixedCosts: any[]) {
    let currentDate = new Date('2026-04-11T14:50:31Z');
    let earliestDataDate: Date | null = null;

    const allDates: number[] = [];
    if (expenses.length > 0) allDates.push(...expenses.map(e => new Date(e.expense_date || e.created_at).getTime()));
    if (incomeSources.length > 0) allDates.push(...incomeSources.filter(s => s.valid_from).map(s => new Date(s.valid_from!).getTime()));
    if (fixedCosts.length > 0) allDates.push(...fixedCosts.filter(fc => fc.valid_from).map(fc => new Date(fc.valid_from!).getTime()));

    if (allDates.length > 0) earliestDataDate = new Date(Math.min(...allDates));

    let earliestDate = earliestDataDate 
        ? new Date(Math.max(earliestDataDate.getTime(), subYears(currentDate, 1).getTime()))
        : subYears(currentDate, 1);

    let simDate = startOfWeek(earliestDate, { weekStartsOn: 1 });
    simDate.setHours(0, 0, 0, 0);

    const now = currentDate;

    let girokontoBalance = 0;
    let currentWeeklyBucket = 0;
    let weeklyIncome = 0;
    let weeklyFixed = 0;

    const expensesByDay: Record<string, number> = {};
    expenses.forEach(e => {
        const key = format(new Date(e.expense_date || e.created_at), 'yyyy-MM-dd');
        expensesByDay[key] = (expensesByDay[key] || 0) + Number(e.amount);
    });

    console.log(`Starting Simulation on: ${format(simDate, 'yyyy-MM-dd')}`);

    while (simDate <= now) {
        const dayOfWeek = simDate.getDay(); 
        const weekEnd = endOfWeek(simDate, { weekStartsOn: 1 });

        if (dayOfWeek === 1) { // MONDAY
            weeklyIncome = incomeSources.reduce((sum, src) => {
                const from = src.valid_from ? new Date(src.valid_from) : null;
                const to = src.valid_to ? new Date(src.valid_to) : null;
                const isActive = (!from || from <= weekEnd) && (!to || to >= simDate);
                if (isActive) {
                    if (src.frequency === 'monthly') return sum + (Number(src.amount) / CONST_WEEKS_PER_MONTH);
                }
                return sum;
            }, 0);

            weeklyFixed = fixedCosts.reduce((sum, fc) => {
                const from = fc.valid_from ? new Date(fc.valid_from) : null;
                const to = fc.valid_to ? new Date(fc.valid_to) : null;
                const isActive = (!from || from <= weekEnd) && (!to || to >= simDate);
                if (isActive) {
                    return sum + (Number(fc.amount) / CONST_WEEKS_PER_MONTH);
                }
                return sum;
            }, 0);

            currentWeeklyBucket = weeklyIncome - weeklyFixed;
            console.log(`\n--- Week of ${format(simDate, 'yyyy-MM-dd')} ---`);
            console.log(`Income this week: +${weeklyIncome.toFixed(2)} (${incomeSources.filter(s => {
                const from = s.valid_from ? new Date(s.valid_from) : null;
                const to = s.valid_to ? new Date(s.valid_to) : null;
                return (!from || from <= weekEnd) && (!to || to >= simDate);
            }).map(s => s.title).join(', ')})`);
            console.log(`Fixed Costs this week: -${weeklyFixed.toFixed(2)} (${fixedCosts.filter(fc => {
                const from = fc.valid_from ? new Date(fc.valid_from) : null;
                const to = fc.valid_to ? new Date(fc.valid_to) : null;
                return (!from || from <= weekEnd) && (!to || to >= simDate);
            }).map(fc => fc.title + ': ' + fc.amount).join(', ')})`);
            console.log(`Weekly Budget added to bucket: ${currentWeeklyBucket.toFixed(2)}`);
        }

        const dayKey = format(simDate, 'yyyy-MM-dd');
        const dayExpenses = expensesByDay[dayKey] || 0;
        
        if (dayExpenses > 0) {
            console.log(`Expense on ${dayKey}: -${dayExpenses.toFixed(2)}`);
        }
        currentWeeklyBucket -= dayExpenses;

        if (dayOfWeek === 0) { // SUNDAY
            console.log(`End of week bucket remaining: ${currentWeeklyBucket.toFixed(2)}`);
            girokontoBalance += currentWeeklyBucket;
            currentWeeklyBucket = 0;
            console.log(`=> Girokonto Balance is now: €${girokontoBalance.toFixed(2)}`);
        }

        simDate = addDays(simDate, 1);
    }
    
    if (now.getDay() !== 0) {
        console.log(`Simulation ended mid-week (it's not Sunday). Unfinished week bucket is: ${currentWeeklyBucket.toFixed(2)}`);
        girokontoBalance += currentWeeklyBucket;
        console.log(`=> Girokonto final balance is: €${girokontoBalance.toFixed(2)}`);
    }

    return girokontoBalance;
}

calculate(expenses, incomeSources, fixedCosts);
