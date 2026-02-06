/**
 * Calculates the savings rate percentage.
 * @param income Total income or budget.
 * @param expenses Total expenses.
 * @returns Savings rate as a percentage value. Returns 0 if income is 0.
 */
export function calculateSavingsRate(income: number, expenses: number): number {
    if (income === 0) return 0;
    const savings = income - expenses;
    const rate = (savings / income) * 100;
    // Clamp between -100 and 100 for display consistency? 
    // The original code did: Math.max(-100, Math.min(100, rate))
    // We will keep the raw calculation logic here and clamp in UI or add a separate option.
    // For pure math, we return the rate. But let's follow the app's business logic if it clamps.
    // Actually, usually testable logic should be pure.
    return rate;
}

/**
 * Calculates the weekly budget from a monthly budget using the factor 4.33.
 * @param monthlyBudget 
 * @returns Weekly gross budget.
 */
export function calculateWeeklyBudget(monthlyBudget: number): number {
    return monthlyBudget / 4.33;
}

/**
 * Calculates the available weekly net budget after fixed costs.
 * @param weeklyGross Weekly gross budget.
 * @param weeklyFixedCosts Weekly portion of fixed costs.
 * @returns Weekly net budget.
 */
export function calculateAvailableWeekly(weeklyGross: number, weeklyFixedCosts: number): number {
    return weeklyGross - weeklyFixedCosts;
}

/**
 * Calculates the projected monthly savings based on current weekly savings.
 * @param weeklySavings Current weekly savings (Net - Expenses).
 * @returns Projected monthly savings.
 */
export function calculateProjectedMonthlySavings(weeklySavings: number): number {
    return weeklySavings * 4.33;
}

/**
 * Converts a monthly fixed cost total to a weekly amount.
 * @param totalFixedCosts 
 * @returns Weekly fixed cost amount.
 */
export function calculateWeeklyFixedCosts(totalFixedCosts: number): number {
    return totalFixedCosts / 4.33;
}
