import { describe, expect, it } from "vitest";

import {
  calculateEarningsCents,
  formatCents,
  remainingBudgetCents,
  wouldExceedBudget,
} from "@/shared/payout";

/**
 * The payout rule is the one piece of arithmetic that decides what a creator is
 * owed, so it is pure and tested directly rather than only through the database.
 */
describe("calculateEarningsCents", () => {
  it("pays per whole thousand views only", () => {
    expect(calculateEarningsCents(999, 250)).toBe(0);
    expect(calculateEarningsCents(1_000, 250)).toBe(250);
    expect(calculateEarningsCents(1_999, 250)).toBe(250);
    expect(calculateEarningsCents(2_000, 250)).toBe(500);
  });

  it("truncates rather than rounds the partial thousand", () => {
    // 42,900 views is 42 whole thousands, not 43.
    expect(calculateEarningsCents(42_900, 300)).toBe(12_600);
  });

  it("earns nothing without a metric row", () => {
    expect(calculateEarningsCents(null, 500)).toBe(0);
    expect(calculateEarningsCents(undefined, 500)).toBe(0);
  });

  it("treats missing or nonsensical inputs as zero, never negative", () => {
    expect(calculateEarningsCents(-5_000, 250)).toBe(0);
    expect(calculateEarningsCents(5_000, 0)).toBe(0);
    expect(calculateEarningsCents(5_000, -250)).toBe(0);
    expect(calculateEarningsCents(Number.NaN, 250)).toBe(0);
    expect(calculateEarningsCents(Number.POSITIVE_INFINITY, 250)).toBe(0);
  });

  it("stays an exact integer at large view counts", () => {
    const cents = calculateEarningsCents(123_456_789, 137);
    expect(cents).toBe(123_456 * 137);
    expect(Number.isSafeInteger(cents)).toBe(true);
  });
});

describe("remainingBudgetCents", () => {
  it("is the plain difference while budget is left", () => {
    expect(remainingBudgetCents(10_000, 2_500)).toBe(7_500);
    expect(remainingBudgetCents(10_000, 10_000)).toBe(0);
  });

  it("never reports a negative remainder", () => {
    expect(remainingBudgetCents(10_000, 12_000)).toBe(0);
  });
});

describe("wouldExceedBudget", () => {
  it("allows an approval that lands exactly on the budget", () => {
    expect(wouldExceedBudget(10_000, 7_500, 2_500)).toBe(false);
  });

  it("blocks the cent that goes over", () => {
    expect(wouldExceedBudget(10_000, 7_500, 2_501)).toBe(true);
  });

  it("allows a zero-cost approval even on an exhausted budget", () => {
    expect(wouldExceedBudget(10_000, 10_000, 0)).toBe(false);
  });
});

describe("formatCents", () => {
  it("renders integer cents without float drift", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(1_234_56)).toBe("$1,234.56");
    expect(formatCents(-250)).toBe("-$2.50");
  });
});
