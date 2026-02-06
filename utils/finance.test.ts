
import { describe, it, expect } from 'vitest';
import {
    calculateSavingsRate,
    calculateWeeklyBudget,
    calculateAvailableWeekly,
    calculateProjectedMonthlySavings
} from './financeHelpers';

describe('Finance Calculations', () => {

    describe('calculateSavingsRate', () => {
        it('should calculate 50% savings rate correctly', () => {
            const result = calculateSavingsRate(1000, 500);
            expect(result).toBe(50.0);
        });

        it('should calculate 0% savings rate when expenses equal income', () => {
            const result = calculateSavingsRate(1000, 1000);
            expect(result).toBe(0);
        });

        it('should calculate 100% savings rate when expenses are 0', () => {
            const result = calculateSavingsRate(1000, 0);
            expect(result).toBe(100);
        });

        it('should handle 0 income gracefully (return 0)', () => {
            const result = calculateSavingsRate(0, 500);
            expect(result).toBe(0);
        });

        it('should calculate negative savings rate (debt)', () => {
            const result = calculateSavingsRate(1000, 1500);
            expect(result).toBe(-50.0);
        });
    });

    describe('calculateWeeklyBudget', () => {
        it('should convert monthly to weekly using 4.33 factor', () => {
            const monthly = 4330;
            const weekly = calculateWeeklyBudget(monthly);
            expect(weekly).toBeCloseTo(1000, 1);
        });

        it('should return 0 for 0 input', () => {
            expect(calculateWeeklyBudget(0)).toBe(0);
        });
    });

    describe('calculateAvailableWeekly', () => {
        it('should subtract fixed costs from gross', () => {
            const result = calculateAvailableWeekly(1000, 200);
            expect(result).toBe(800);
        });
    });

    describe('calculateProjectedMonthlySavings', () => {
        it('should project weekly savings back to month', () => {
            const weeklySavings = 100;
            const projected = calculateProjectedMonthlySavings(weeklySavings);
            expect(projected).toBe(433);
        });

        it('should project negative savings', () => {
            const weeklySavings = -100;
            const projected = calculateProjectedMonthlySavings(weeklySavings);
            expect(projected).toBe(-433);
        });
    });

});
