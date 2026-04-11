import { calculateGirokontoTimeline } from '../utils/girokonto';
import * as fs from 'fs';

const RawData = JSON.parse(fs.readFileSync('./scripts/userdata.json', 'utf8'));

// Format to correct schema, checking for missing required fields if any (schema is broad)
const expenses = RawData.expenses;
const incomeSources = RawData.incomeSources;
const fixedCosts = RawData.fixedCosts;

// Ensure consistent timing for testing
const originalDate = Date;
class MockDate extends Date {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super('2026-04-11T16:50:31+02:00');
    } else {
      super(...args as []);
    }
  }
}
// @ts-ignore
global.Date = MockDate;
global.Date.now = () => new originalDate('2026-04-11T16:50:31+02:00').getTime();

const result = calculateGirokontoTimeline(expenses, incomeSources, fixedCosts);
console.log('Final Balance: €' + result.finalBalance.toFixed(2));

console.log("\nTimeline Breakdown:");
for(let i = 1; i < result.timeline.length; i++) {
  const diff = result.timeline[i].balance - result.timeline[i-1].balance;
  if(diff !== 0) {
     const d = new originalDate(result.timeline[i].date);
     console.log(`${d.toISOString().slice(0, 10)} - Balance chg: ${diff.toFixed(2)}, new Bal: €${result.timeline[i].balance.toFixed(2)}`);
  }
}


// Debug the timeline and buckets week by week
// Actually, let's just log the events over time
// Wait, timeline gives balance at the end of every day.
console.log("\nTimeline Breakdown:");
for(const entry of result.timeline) {
  // Only print sundays (rollover) and today
  const d = new originalDate(entry.date);
  // console.log(`${d.toISOString().slice(0, 10)} - Balance: €${entry.balance.toFixed(2)}`);
  if (d.getDay() === 0 || d.toISOString().slice(0,10) === '2026-04-11') {
      console.log(`${d.toISOString().slice(0, 10)} - Balance: €${entry.balance.toFixed(2)}`);
  }
}
