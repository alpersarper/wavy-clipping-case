import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { approveSubmission } from "@/server/services/approval";
import { getCampaignOverview } from "@/server/services/campaigns";
import { AppError } from "@/shared/errors";
import {
  connectTestDb,
  makeCampaign,
  makeSubmission,
  makeUser,
  resetDb,
} from "./helpers";

const { db, close } = connectTestDb();

afterAll(close);
beforeEach(() => resetDb(db));

async function spentCents(campaignId: string): Promise<number> {
  const [row] = await db
    .select({ spent: sql<number>`coalesce(sum(${submissions.approvedPayoutCents}), 0)::int` })
    .from(submissions)
    .where(
      and(eq(submissions.campaignId, campaignId), inArray(submissions.status, ["approved", "paid"])),
    );
  return Number(row?.spent ?? 0);
}

async function statusOf(campaignId: string): Promise<string> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return row.status;
}

describe("budget ceiling", () => {
  it("commits the payout priced from the most recent metric row", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, { payoutPer1kViews: 250, totalBudget: 100_000 });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 4_000,
      capturedAt: "2026-01-02",
    });

    // A newer, higher snapshot must be the one that prices the approval.
    await db.insert(submissionMetrics).values({
      submissionId: submission.id,
      capturedAt: "2026-01-05",
      views: 12_900,
      likes: 0,
      comments: 0,
    });

    const result = await approveSubmission(db, {
      submissionId: submission.id,
      reviewerId: admin.id,
    });

    // floor(12,900 / 1000) * 250 = 12 * 250
    expect(result.payoutCents).toBe(3_000);
    expect(await spentCents(campaign.id)).toBe(3_000);
  });

  it("refuses the approval that would cross the budget, and changes nothing", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    // Each 10k-view clip costs 1,000 cents. Five fit; the sixth needs 1,000
    // against a remaining 500, so it must be refused rather than trimmed.
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 5_500 });

    for (let i = 0; i < 5; i++) {
      const submission = await makeSubmission(db, {
        campaignId: campaign.id,
        creatorId: creator.id,
        views: 10_000,
      });
      await approveSubmission(db, { submissionId: submission.id, reviewerId: admin.id });
    }
    expect(await spentCents(campaign.id)).toBe(5_000);

    const overflow = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });

    const error = await approveSubmission(db, {
      submissionId: overflow.id,
      reviewerId: admin.id,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).payload).toMatchObject({
      code: "BUDGET_EXCEEDED",
      requiredCents: 1_000,
      remainingCents: 500,
      totalBudgetCents: 5_500,
    });

    // Rolled back: still pending, budget untouched.
    const [row] = await db.select().from(submissions).where(eq(submissions.id, overflow.id));
    expect(row.status).toBe("pending");
    expect(row.approvedPayoutCents).toBeNull();
    expect(await spentCents(campaign.id)).toBe(5_000);
    // Budget was not exhausted, only insufficient, so the campaign stays open.
    expect(await statusOf(campaign.id)).toBe("active");
  });

  it("allows an approval that lands exactly on the budget", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 1_000 });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });

    const result = await approveSubmission(db, {
      submissionId: submission.id,
      reviewerId: admin.id,
    });

    expect(result.payoutCents).toBe(1_000);
    expect(result.budgetRemainingCents).toBe(0);
  });

  it("completes the campaign by itself once nothing is left to pay out", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 2_000 });

    const first = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });
    await approveSubmission(db, { submissionId: first.id, reviewerId: admin.id });
    expect(await statusOf(campaign.id)).toBe("active");

    const second = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });
    const result = await approveSubmission(db, {
      submissionId: second.id,
      reviewerId: admin.id,
    });

    expect(result.campaignStatus).toBe("completed");
    expect(await statusOf(campaign.id)).toBe("completed");
  });

  it("closes review on a completed campaign", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, { status: "completed", totalBudget: 100_000 });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    const error = await approveSubmission(db, {
      submissionId: submission.id,
      reviewerId: admin.id,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).payload).toMatchObject({
      code: "CAMPAIGN_NOT_ACCEPTING_REVIEW",
      status: "completed",
    });
  });

  it("approves a clip worth nothing yet, and charges nothing for it", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, { payoutPer1kViews: 500, totalBudget: 1_000 });

    const noMetrics = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    const belowOneThousand = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 999,
    });

    expect(
      (await approveSubmission(db, { submissionId: noMetrics.id, reviewerId: admin.id }))
        .payoutCents,
    ).toBe(0);
    expect(
      (await approveSubmission(db, { submissionId: belowOneThousand.id, reviewerId: admin.id }))
        .payoutCents,
    ).toBe(0);
    expect(await spentCents(campaign.id)).toBe(0);
    // Nothing was spent, so the campaign is not finished.
    expect(await statusOf(campaign.id)).toBe("active");
  });

  it("keeps the overview in step with the ledger", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, {
      payoutPer1kViews: 100,
      totalBudget: 10_000,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      endsAt: new Date("2026-01-05T00:00:00Z"),
    });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 25_000,
      capturedAt: "2026-01-02",
    });
    await approveSubmission(db, { submissionId: submission.id, reviewerId: admin.id });

    const overview = await getCampaignOverview(db, campaign.id);
    expect(overview.budgetSpentCents).toBe(2_500);
    expect(overview.budgetLeftCents).toBe(7_500);
    expect(overview.totalApprovedViews).toBe(25_000);
    expect(overview.approvedSubmissionCount).toBe(1);
  });
});
