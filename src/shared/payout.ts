/**
 * Payout arithmetic. Pure, integer-only, and shared by the server (what gets
 * committed) and the client (what a creator sees as an estimate).
 *
 * Every amount is integer cents. No float ever touches money.
 */

/**
 * Earnings for a single submission:
 *
 *     floor(views / 1000) * payout_per_1k_views
 *
 * Views come from the most recent metric row; `null`/absent metrics mean the
 * clip has not been measured yet and therefore earns nothing.
 */
export function calculateEarningsCents(
  views: number | null | undefined,
  payoutPer1kViews: number,
): number {
  if (views == null || !Number.isFinite(views) || views <= 0) return 0;
  if (!Number.isFinite(payoutPer1kViews) || payoutPer1kViews <= 0) return 0;
  return Math.floor(views / 1000) * Math.trunc(payoutPer1kViews);
}

/** Budget still available. Never negative, even if the ledger is odd. */
export function remainingBudgetCents(
  totalBudgetCents: number,
  spentCents: number,
): number {
  return Math.max(0, Math.trunc(totalBudgetCents) - Math.trunc(spentCents));
}

/** Whether committing `amountCents` would push the campaign past its budget. */
export function wouldExceedBudget(
  totalBudgetCents: number,
  spentCents: number,
  amountCents: number,
): boolean {
  return Math.trunc(spentCents) + Math.trunc(amountCents) > Math.trunc(totalBudgetCents);
}

/** Formats integer cents for display, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${rest}`;
}
