import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { AppError, NotFoundError } from "@/shared/errors";
import { calculateEarningsCents, remainingBudgetCents, wouldExceedBudget } from "@/shared/payout";

/**
 * A `draft` campaign never had live submissions, so there is nothing to review.
 * `completed` is handled separately, after pricing: it is normally reached by
 * exhausting the budget, and in that case the caller deserves the specific
 * over-budget error rather than "this campaign is closed".
 */
const NEVER_REVIEWABLE = new Set<string>(["draft"]);

export type ApprovalResult = {
  submissionId: string;
  /** Cents committed by this approval. Frozen; later view growth does not change it. */
  payoutCents: number;
  budgetSpentCents: number;
  budgetRemainingCents: number;
  campaignStatus: "draft" | "active" | "paused" | "completed";
};

export type ApprovalHooks = {
  /**
   * Test seam. Invoked while this transaction holds the campaign row lock, so a
   * test can start a second, competing approval and prove it blocks.
   * Never set in application code.
   */
  afterCampaignLock?: () => Promise<void>;
};

/**
 * Approves one submission inside a single transaction.
 *
 * Ordering is fixed -- campaign row first, then submission row -- so two
 * approvals racing on the same campaign can never deadlock. `FOR UPDATE` on the
 * campaign serialises every writer that could move the budget, which means the
 * `SUM` below is read after the previous winner has committed.
 */
export async function approveSubmission(
  db: Database,
  params: { submissionId: string; reviewerId: string },
  hooks: ApprovalHooks = {},
): Promise<ApprovalResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ campaignId: submissions.campaignId })
      .from(submissions)
      .where(eq(submissions.id, params.submissionId))
      .limit(1);

    if (!target) throw new NotFoundError("Submission not found");

    // 1. Lock the campaign. Everything that can move the budget waits here.
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, target.campaignId))
      .limit(1)
      .for("update");

    if (!campaign) throw new NotFoundError("Campaign not found");

    await hooks.afterCampaignLock?.();

    if (NEVER_REVIEWABLE.has(campaign.status)) {
      throw new AppError(
        { code: "CAMPAIGN_NOT_ACCEPTING_REVIEW", status: campaign.status },
        `Campaign is ${campaign.status}; approvals are closed`,
      );
    }

    // 2. Lock the submission too, so the same submission cannot be approved twice.
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, params.submissionId))
      .limit(1)
      .for("update");

    if (!submission) throw new NotFoundError("Submission not found");
    if (submission.status !== "pending") {
      throw new AppError(
        { code: "SUBMISSION_ALREADY_REVIEWED", status: submission.status },
        `Submission is already ${submission.status}`,
      );
    }

    // 3. Recompute spend from the ledger, under the lock.
    const [spentRow] = await tx
      .select({
        spent: sql<number>`coalesce(sum(${submissions.approvedPayoutCents}), 0)::int`,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.campaignId, campaign.id),
          inArray(submissions.status, ["approved", "paid"]),
        ),
      );
    const spentCents = spentRow?.spent ?? 0;

    // 4. Price this submission from its most recent metric row.
    const [latestMetric] = await tx
      .select({ views: submissionMetrics.views })
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, submission.id))
      .orderBy(desc(submissionMetrics.capturedAt))
      .limit(1);

    const payoutCents = calculateEarningsCents(
      latestMetric?.views ?? null,
      campaign.payoutPer1kViews,
    );

    // Budget is checked before the `completed` guard on purpose. Losing a race
    // for the last of the budget is an over-budget failure, and the admin needs
    // the amounts, not the campaign's new status.
    if (wouldExceedBudget(campaign.totalBudget, spentCents, payoutCents)) {
      throw new AppError(
        {
          code: "BUDGET_EXCEEDED",
          requiredCents: payoutCents,
          remainingCents: remainingBudgetCents(campaign.totalBudget, spentCents),
          totalBudgetCents: campaign.totalBudget,
        },
        "Approving this submission would exceed the campaign budget",
      );
    }

    // Still solvent but closed: an admin ended this campaign by hand.
    if (campaign.status === "completed") {
      throw new AppError(
        { code: "CAMPAIGN_NOT_ACCEPTING_REVIEW", status: campaign.status },
        "Campaign is completed; approvals are closed",
      );
    }

    const now = new Date();
    await tx
      .update(submissions)
      .set({
        status: "approved",
        approvedPayoutCents: payoutCents,
        rejectionReason: null,
        reviewedAt: now,
        reviewedBy: params.reviewerId,
        updatedAt: now,
      })
      .where(eq(submissions.id, submission.id));

    const budgetSpentCents = spentCents + payoutCents;
    const budgetRemainingCents = remainingBudgetCents(campaign.totalBudget, budgetSpentCents);

    // 5. A campaign with nothing left to pay out closes itself. Reaching here
    // means the campaign was still open, so no "already completed" case exists.
    let campaignStatus: ApprovalResult["campaignStatus"] = campaign.status;
    if (budgetRemainingCents === 0) {
      campaignStatus = "completed";
      await tx
        .update(campaigns)
        .set({ status: "completed", updatedAt: now })
        .where(eq(campaigns.id, campaign.id));
    }

    return {
      submissionId: submission.id,
      payoutCents,
      budgetSpentCents,
      budgetRemainingCents,
      campaignStatus,
    };
  });
}

/**
 * Rejects one submission. No budget is involved, so this only locks the
 * submission row -- a strict subset of the approval lock set, in the same
 * order, so the two can never deadlock against each other.
 */
export async function rejectSubmission(
  db: Database,
  params: { submissionId: string; reviewerId: string; reason: string },
): Promise<{ submissionId: string }> {
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, params.submissionId))
      .limit(1)
      .for("update");

    if (!submission) throw new NotFoundError("Submission not found");
    if (submission.status !== "pending") {
      throw new AppError(
        { code: "SUBMISSION_ALREADY_REVIEWED", status: submission.status },
        `Submission is already ${submission.status}`,
      );
    }

    const now = new Date();
    await tx
      .update(submissions)
      .set({
        status: "rejected",
        rejectionReason: params.reason,
        approvedPayoutCents: null,
        reviewedAt: now,
        reviewedBy: params.reviewerId,
        updatedAt: now,
      })
      .where(eq(submissions.id, submission.id));

    return { submissionId: submission.id };
  });
}
