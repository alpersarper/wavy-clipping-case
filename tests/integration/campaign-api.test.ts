import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { UserRow } from "@/server/db/schema";
import { submissionMetrics } from "@/server/db/schema";
import { approveSubmission } from "@/server/services/approval";
import { getCampaignOverview } from "@/server/services/campaigns";
import { createCaller } from "@/server/trpc/root";
import { AppError } from "@/shared/errors";
import { connectTestDb, makeCampaign, makeSubmission, makeUser, resetDb } from "./helpers";

const { db, close } = connectTestDb();

afterAll(close);
beforeEach(() => resetDb(db));

function callerFor(user: UserRow) {
  return createCaller({ db, user, resHeaders: new Headers() });
}

async function admin(): Promise<UserRow> {
  const created = await makeUser(db, "admin");
  const rows = await db.query.users.findMany();
  return rows.find((u) => u.id === created.id)!;
}

async function creator(): Promise<UserRow> {
  const created = await makeUser(db, "creator");
  const rows = await db.query.users.findMany();
  return rows.find((u) => u.id === created.id)!;
}

describe("campaign list", () => {
  it("paginates on the server, and searches and filters in the query", async () => {
    const caller = callerFor(await admin());

    for (let i = 0; i < 12; i++) {
      await makeCampaign(db, {
        title: i % 2 === 0 ? `Sneaker drop ${i}` : `Coffee push ${i}`,
        status: i < 3 ? "draft" : "active",
      });
    }

    const firstPage = await caller.campaign.list({ page: 1, pageSize: 5 });
    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.total).toBe(12);
    expect(firstPage.pageCount).toBe(3);

    const lastPage = await caller.campaign.list({ page: 3, pageSize: 5 });
    expect(lastPage.items).toHaveLength(2);

    const searched = await caller.campaign.list({ page: 1, pageSize: 50, search: "sneaker" });
    expect(searched.total).toBe(6);
    expect(searched.items.every((c) => c.title.toLowerCase().includes("sneaker"))).toBe(true);

    const filtered = await caller.campaign.list({ page: 1, pageSize: 50, status: "draft" });
    expect(filtered.total).toBe(3);

    const both = await caller.campaign.list({
      page: 1,
      pageSize: 50,
      search: "Coffee",
      status: "draft",
    });
    expect(both.total).toBe(1);
  });

  it("treats a search containing % as literal text", async () => {
    const caller = callerFor(await admin());
    await makeCampaign(db, { title: "Plain title" });
    await makeCampaign(db, { title: "100% cotton tees" });

    const result = await caller.campaign.list({ page: 1, pageSize: 50, search: "100%" });
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe("100% cotton tees");
  });
});

describe("campaign overview series", () => {
  it("covers every day of the period, including days with no metrics", async () => {
    const reviewer = await admin();
    const author = await creator();
    const campaign = await makeCampaign(db, {
      payoutPer1kViews: 100,
      totalBudget: 1_000_000,
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-07T00:00:00Z"),
    });

    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: author.id,
      views: 1_000,
      capturedAt: "2026-03-02",
    });
    // Nothing captured on the 3rd or 4th; a gap the chart must still show.
    await db.insert(submissionMetrics).values([
      { submissionId: submission.id, capturedAt: "2026-03-05", views: 4_000, likes: 0, comments: 0 },
      { submissionId: submission.id, capturedAt: "2026-03-06", views: 4_500, likes: 0, comments: 0 },
    ]);
    await approveSubmission(db, { submissionId: submission.id, reviewerId: reviewer.id });

    const overview = await getCampaignOverview(db, campaign.id);

    expect(overview.dailyViews.map((d) => d.day)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
    ]);
    // Per-day *new* views: 1,000 on the 2nd, then +3,000 and +500.
    expect(overview.dailyViews.map((d) => d.views)).toEqual([0, 1_000, 0, 0, 3_000, 500, 0]);
    // The headline number is the latest snapshot, not the sum of the deltas.
    expect(overview.totalApprovedViews).toBe(4_500);
  });

  it("returns a flat zero series for a campaign with no submissions", async () => {
    await admin();
    const campaign = await makeCampaign(db, {
      startsAt: new Date("2026-04-01T00:00:00Z"),
      endsAt: new Date("2026-04-03T00:00:00Z"),
    });

    const overview = await getCampaignOverview(db, campaign.id);
    expect(overview.dailyViews).toEqual([
      { day: "2026-04-01", views: 0 },
      { day: "2026-04-02", views: 0 },
      { day: "2026-04-03", views: 0 },
    ]);
    expect(overview.budgetSpentCents).toBe(0);
    expect(overview.budgetLeftCents).toBe(campaign.totalBudget);
  });
});

describe("editing a campaign", () => {
  it("refuses to lower the budget below what is already committed", async () => {
    const reviewer = await admin();
    const author = await creator();
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 10_000 });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: author.id,
      views: 30_000,
    });
    await approveSubmission(db, { submissionId: submission.id, reviewerId: reviewer.id });

    const edit = {
      id: campaign.id,
      title: campaign.title,
      platforms: campaign.platforms,
      payoutPer1kViews: campaign.payoutPer1kViews,
      status: campaign.status,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    };

    const error = await callerFor(reviewer)
      .campaign.update({ ...edit, totalBudget: 2_000 })
      .catch((e: unknown) => e);

    expect((error as { cause: AppError }).cause).toBeInstanceOf(AppError);
    expect((error as { cause: AppError }).cause.payload).toMatchObject({
      code: "BUDGET_BELOW_COMMITTED",
      committedCents: 3_000,
      attemptedBudgetCents: 2_000,
    });

    // Untouched, and lowering to exactly the committed amount is fine.
    const overview = await getCampaignOverview(db, campaign.id);
    expect(overview.campaign.totalBudget).toBe(10_000);

    await expect(
      callerFor(reviewer).campaign.update({ ...edit, totalBudget: 3_000 }),
    ).resolves.toMatchObject({ totalBudget: 3_000 });
  });
});

describe("creating a submission", () => {
  it("accepts a post URL on one of the campaign's platforms", async () => {
    const author = await creator();
    const campaign = await makeCampaign(db, { platforms: ["tiktok", "youtube"] });

    const created = await callerFor(author).submission.create({
      campaignId: campaign.id,
      postUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    // Platform is derived server-side from the URL, never supplied by the client.
    expect(created.platform).toBe("youtube");
    expect(created.status).toBe("pending");
    expect(created.creatorId).toBe(author.id);
  });

  it("refuses a real post URL on a platform the campaign does not run on", async () => {
    const author = await creator();
    const campaign = await makeCampaign(db, { platforms: ["tiktok"] });

    const error = await callerFor(author)
      .submission.create({
        campaignId: campaign.id,
        postUrl: "https://www.instagram.com/reel/CxAbCdEfGh1/",
      })
      .catch((e: unknown) => e);

    expect((error as { data?: { appError?: unknown } }).data?.appError ?? error).toBeDefined();
    expect((error as { cause?: AppError }).cause).toBeInstanceOf(AppError);
    expect((error as { cause: AppError }).cause.payload).toMatchObject({
      code: "PLATFORM_NOT_ALLOWED",
      detected: "instagram",
      allowed: ["tiktok"],
    });
  });

  it("refuses something that is not a post URL at all", async () => {
    const author = await creator();
    const campaign = await makeCampaign(db);

    await expect(
      callerFor(author).submission.create({
        campaignId: campaign.id,
        // A profile page, not a post.
        postUrl: "https://www.tiktok.com/@someone",
      }),
    ).rejects.toThrow();
  });

  it("refuses the same post twice on one campaign, however it is written", async () => {
    const author = await creator();
    const other = await creator();
    const campaign = await makeCampaign(db, { platforms: ["tiktok"] });
    const url = "https://www.tiktok.com/@someone/video/7301234567890123456";

    await callerFor(author).submission.create({ campaignId: campaign.id, postUrl: url });

    const error = await callerFor(other)
      .submission.create({
        campaignId: campaign.id,
        // Same clip, dressed up with a tracking param and a trailing slash.
        postUrl: `${url}/?utm_source=newsletter`,
      })
      .catch((e: unknown) => e);

    expect((error as { cause: AppError }).cause).toBeInstanceOf(AppError);
    expect((error as { cause: AppError }).cause.payload).toMatchObject({
      code: "DUPLICATE_SUBMISSION_URL",
    });

    // The same clip on a *different* campaign is perfectly fine.
    const second = await makeCampaign(db, { platforms: ["tiktok"] });
    await expect(
      callerFor(author).submission.create({ campaignId: second.id, postUrl: url }),
    ).resolves.toMatchObject({ campaignId: second.id });
  });

  it("refuses the same clip dressed up with a junk v param", async () => {
    const author = await creator();
    const campaign = await makeCampaign(db, { platforms: ["tiktok"] });
    const url = "https://www.tiktok.com/@someone/video/7301234567890123456";

    await callerFor(author).submission.create({ campaignId: campaign.id, postUrl: url });

    const error = await callerFor(author)
      .submission.create({ campaignId: campaign.id, postUrl: `${url}?v=1` })
      .catch((e: unknown) => e);

    expect((error as { cause: AppError }).cause).toBeInstanceOf(AppError);
    expect((error as { cause: AppError }).cause.payload).toMatchObject({
      code: "DUPLICATE_SUBMISSION_URL",
    });
  });

  it("refuses submissions to a campaign that is not active", async () => {
    const author = await creator();
    for (const status of ["draft", "paused", "completed"] as const) {
      const campaign = await makeCampaign(db, { status, platforms: ["tiktok"] });
      const error = await callerFor(author)
        .submission.create({
          campaignId: campaign.id,
          postUrl: "https://www.tiktok.com/@someone/video/7309999999999999999",
        })
        .catch((e: unknown) => e);

      expect((error as { cause: AppError }).cause.payload).toMatchObject({
        code: "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS",
        status,
      });
    }
  });

  it("reports live estimated earnings while pending and the committed amount once approved", async () => {
    const reviewer = await admin();
    const author = await creator();
    const campaign = await makeCampaign(db, { payoutPer1kViews: 250, totalBudget: 100_000 });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: author.id,
      views: 12_400,
    });

    const beforeReview = await callerFor(author).submission.mine({ page: 1, pageSize: 10 });
    expect(beforeReview.items[0]).toMatchObject({
      status: "pending",
      currentViews: 12_400,
      estimatedEarningsCents: 3_000, // floor(12.4) * 250
      approvedPayoutCents: null,
    });

    await approveSubmission(db, { submissionId: submission.id, reviewerId: reviewer.id });

    // Views keep climbing after approval; the committed payout does not move.
    await db.insert(submissionMetrics).values({
      submissionId: submission.id,
      capturedAt: "2026-01-09",
      views: 90_000,
      likes: 0,
      comments: 0,
    });

    const afterReview = await callerFor(author).submission.mine({ page: 1, pageSize: 10 });
    expect(afterReview.items[0]).toMatchObject({
      status: "approved",
      currentViews: 90_000,
      approvedPayoutCents: 3_000,
    });
  });
});
