import { eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/server/db";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
} from "@/server/db/schema";
import { approveSubmission, rejectSubmission } from "@/server/services/approval";
import { normalizePostUrl, type Platform } from "@/shared/platform";

/**
 * Deterministic, re-runnable seed.
 *
 * Ids are fixed, and the run truncates first, so `pnpm seed` twice in a row
 * leaves exactly the same database. Dates are anchored to today (UTC) so the
 * "active" campaigns are actually live whenever you run it.
 *
 * Approvals and rejections go through the real services rather than being
 * written directly, so seeded data cannot violate the budget ceiling or any
 * check constraint.
 */

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const CREATOR_IDS = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
];

function campaignId(n: number): string {
  return `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
}

function submissionId(n: number): string {
  return `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
}

function utcMidnight(offsetDays: number): Date {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day + offsetDays * 86_400_000);
}

function dayString(offsetDays: number): string {
  return utcMidnight(offsetDays).toISOString().slice(0, 10);
}

type CampaignSeed = {
  n: number;
  title: string;
  platforms: Platform[];
  payoutPer1kViews: number;
  totalBudget: number;
  status: "draft" | "active" | "paused" | "completed";
  startsOffset: number;
  endsOffset: number;
};

const CAMPAIGNS: CampaignSeed[] = [
  { n: 1, title: "Summer Sneaker Drop", platforms: ["tiktok", "instagram"], payoutPer1kViews: 250, totalBudget: 500_00, status: "active", startsOffset: -10, endsOffset: 20 },
  { n: 2, title: "Energy Drink Launch", platforms: ["tiktok"], payoutPer1kViews: 180, totalBudget: 300_00, status: "active", startsOffset: -7, endsOffset: 14 },
  { n: 3, title: "Indie Game Teaser", platforms: ["youtube"], payoutPer1kViews: 400, totalBudget: 750_00, status: "active", startsOffset: -14, endsOffset: 7 },
  { n: 4, title: "Skincare Routine Clips", platforms: ["instagram", "tiktok"], payoutPer1kViews: 320, totalBudget: 400_00, status: "active", startsOffset: -5, endsOffset: 25 },
  { n: 5, title: "Festival Aftermovie Cuts", platforms: ["tiktok", "youtube"], payoutPer1kViews: 150, totalBudget: 250_00, status: "active", startsOffset: -12, endsOffset: 10 },
  { n: 6, title: "Coffee Brand Ambassadors", platforms: ["instagram"], payoutPer1kViews: 200, totalBudget: 180_00, status: "active", startsOffset: -3, endsOffset: 30 },
  { n: 7, title: "Fitness App Challenge", platforms: ["tiktok", "instagram", "youtube"], payoutPer1kViews: 275, totalBudget: 600_00, status: "active", startsOffset: -20, endsOffset: 5 },
  { n: 8, title: "Streetwear Lookbook", platforms: ["instagram"], payoutPer1kViews: 225, totalBudget: 220_00, status: "active", startsOffset: -1, endsOffset: 28 },
  { n: 9, title: "Autumn Collection Tease", platforms: ["tiktok"], payoutPer1kViews: 190, totalBudget: 350_00, status: "draft", startsOffset: 5, endsOffset: 35 },
  { n: 10, title: "Podcast Clip Push", platforms: ["youtube", "tiktok"], payoutPer1kViews: 210, totalBudget: 260_00, status: "paused", startsOffset: -18, endsOffset: 4 },
  { n: 11, title: "Meal Kit Unboxing", platforms: ["instagram", "youtube"], payoutPer1kViews: 240, totalBudget: 300_00, status: "paused", startsOffset: -25, endsOffset: -2 },
  // Budget is tiny on purpose: the seeded approvals exhaust it and the engine
  // flips this campaign to `completed` by itself.
  { n: 12, title: "Winter Gear Teardown", platforms: ["youtube"], payoutPer1kViews: 300, totalBudget: 15_00, status: "active", startsOffset: -30, endsOffset: -5 },
];

type SubmissionSeed = {
  n: number;
  campaign: number;
  creator: number;
  url: string;
  /** What the seed wants the submission to end up as. */
  outcome: "pending" | "approve" | "reject" | "paid";
  /** Views on the newest metric day; earlier days are scaled down from this. */
  peakViews: number;
  metricDays: number;
};

const SUBMISSIONS: SubmissionSeed[] = [
  { n: 1, campaign: 1, creator: 0, url: "https://www.tiktok.com/@clipqueen/video/7301234567890123456", outcome: "approve", peakViews: 42_000, metricDays: 5 },
  { n: 2, campaign: 1, creator: 1, url: "https://www.instagram.com/reel/CxAbCdEfGh1/", outcome: "approve", peakViews: 18_400, metricDays: 5 },
  { n: 3, campaign: 1, creator: 2, url: "https://www.tiktok.com/@editking/video/7301234567890123457", outcome: "pending", peakViews: 9_900, metricDays: 4 },
  { n: 4, campaign: 1, creator: 0, url: "https://www.tiktok.com/@clipqueen/video/7301234567890123458", outcome: "reject", peakViews: 1_200, metricDays: 2 },
  { n: 5, campaign: 2, creator: 1, url: "https://www.tiktok.com/@fizzfan/video/7311234567890123456", outcome: "approve", peakViews: 61_000, metricDays: 6 },
  { n: 6, campaign: 2, creator: 2, url: "https://www.tiktok.com/@fizzfan/video/7311234567890123457", outcome: "pending", peakViews: 27_500, metricDays: 3 },
  { n: 7, campaign: 3, creator: 0, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", outcome: "paid", peakViews: 88_000, metricDays: 7 },
  { n: 8, campaign: 3, creator: 1, url: "https://www.youtube.com/shorts/aBcDeFgHiJk", outcome: "pending", peakViews: 12_300, metricDays: 4 },
  { n: 9, campaign: 3, creator: 2, url: "https://youtu.be/LmNoPqRsTuV", outcome: "reject", peakViews: 400, metricDays: 2 },
  { n: 10, campaign: 4, creator: 0, url: "https://www.instagram.com/p/CxGlowUp01/", outcome: "approve", peakViews: 33_100, metricDays: 4 },
  { n: 11, campaign: 4, creator: 1, url: "https://www.instagram.com/reel/CxGlowUp02/", outcome: "pending", peakViews: 5_600, metricDays: 3 },
  { n: 12, campaign: 5, creator: 2, url: "https://www.tiktok.com/@festivalcuts/video/7321234567890123456", outcome: "approve", peakViews: 74_200, metricDays: 6 },
  { n: 13, campaign: 5, creator: 0, url: "https://www.youtube.com/shorts/FestCut0001", outcome: "pending", peakViews: 15_800, metricDays: 3 },
  { n: 14, campaign: 6, creator: 1, url: "https://www.instagram.com/reel/CxBeanThere/", outcome: "pending", peakViews: 21_000, metricDays: 3 },
  { n: 15, campaign: 7, creator: 2, url: "https://www.tiktok.com/@fitfam/video/7331234567890123456", outcome: "approve", peakViews: 56_700, metricDays: 8 },
  { n: 16, campaign: 7, creator: 0, url: "https://www.instagram.com/reel/CxFitFam001/", outcome: "pending", peakViews: 8_100, metricDays: 4 },
  { n: 17, campaign: 7, creator: 1, url: "https://www.youtube.com/watch?v=FitFamClip1", outcome: "reject", peakViews: 900, metricDays: 2 },
  { n: 18, campaign: 10, creator: 0, url: "https://www.youtube.com/watch?v=PodClip00001", outcome: "pending", peakViews: 19_400, metricDays: 5 },
  { n: 19, campaign: 11, creator: 1, url: "https://www.instagram.com/p/CxMealKit01/", outcome: "approve", peakViews: 30_000, metricDays: 5 },
  // Two clips against a 15.00 budget at 3.00 per 1k views: the first commits
  // 15.00 and completes the campaign, the second is left pending.
  { n: 20, campaign: 12, creator: 2, url: "https://www.youtube.com/watch?v=WinterGear1", outcome: "approve", peakViews: 5_000, metricDays: 4 },
  { n: 21, campaign: 12, creator: 0, url: "https://www.youtube.com/watch?v=WinterGear2", outcome: "pending", peakViews: 4_100, metricDays: 4 },
];

export async function seed(db: Database): Promise<void> {
  // Fresh every run; `restart identity cascade` keeps this deterministic.
  await db.execute(
    sql`truncate table "submission_metric", "submission", "campaign", "user" restart identity cascade`,
  );

  await db.insert(users).values([
    { id: ADMIN_ID, email: "admin@wavy.test", role: "admin" },
    { id: CREATOR_IDS[0], email: "creator.one@wavy.test", role: "creator" },
    { id: CREATOR_IDS[1], email: "creator.two@wavy.test", role: "creator" },
    { id: CREATOR_IDS[2], email: "creator.three@wavy.test", role: "creator" },
  ]);

  await db.insert(campaigns).values(
    CAMPAIGNS.map((c) => ({
      id: campaignId(c.n),
      title: c.title,
      platforms: c.platforms,
      payoutPer1kViews: c.payoutPer1kViews,
      totalBudget: c.totalBudget,
      // Everything starts reviewable; final statuses are applied at the end so
      // the seeded approvals can run through the real engine.
      status: c.status === "draft" ? ("draft" as const) : ("active" as const),
      startsAt: utcMidnight(c.startsOffset),
      endsAt: utcMidnight(c.endsOffset),
    })),
  );

  await db.insert(submissions).values(
    SUBMISSIONS.map((s) => ({
      id: submissionId(s.n),
      campaignId: campaignId(s.campaign),
      creatorId: CREATOR_IDS[s.creator],
      postUrl: s.url,
      normalizedUrl: normalizePostUrl(s.url),
      platform: platformOf(s.url),
      status: "pending" as const,
      createdAt: utcMidnight(-s.metricDays),
    })),
  );

  // A few days of metrics, growing towards `peakViews`.
  const metricRows = SUBMISSIONS.flatMap((s) =>
    Array.from({ length: s.metricDays }, (_, i) => {
      const dayOffset = -(s.metricDays - 1 - i);
      const progress = (i + 1) / s.metricDays;
      const views = Math.max(1, Math.round(s.peakViews * progress));
      return {
        submissionId: submissionId(s.n),
        capturedAt: dayString(dayOffset),
        views,
        likes: Math.floor(views * 0.06),
        comments: Math.floor(views * 0.006),
      };
    }),
  );
  await db.insert(submissionMetrics).values(metricRows);

  // Reviews run through the real services, in a fixed order.
  for (const s of SUBMISSIONS) {
    if (s.outcome === "approve" || s.outcome === "paid") {
      await approveSubmission(db, {
        submissionId: submissionId(s.n),
        reviewerId: ADMIN_ID,
      });
    } else if (s.outcome === "reject") {
      await rejectSubmission(db, {
        submissionId: submissionId(s.n),
        reviewerId: ADMIN_ID,
        reason: "Clip does not feature the product clearly enough.",
      });
    }
  }

  const paidIds = SUBMISSIONS.filter((s) => s.outcome === "paid").map((s) => submissionId(s.n));
  if (paidIds.length > 0) {
    await db
      .update(submissions)
      .set({ status: "paid", updatedAt: new Date() })
      .where(inArray(submissions.id, paidIds));
  }

  // Apply the intended final campaign statuses, but never override a campaign
  // the engine already completed by exhausting its budget.
  for (const c of CAMPAIGNS) {
    if (c.status === "draft" || c.status === "active") continue;
    await db
      .update(campaigns)
      .set({ status: c.status, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId(c.n)));
  }
}

function platformOf(url: string): Platform {
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return "youtube";
}

export const SEED_SUMMARY = {
  campaigns: CAMPAIGNS.length,
  submissions: SUBMISSIONS.length,
  users: CREATOR_IDS.length + 1,
  adminEmail: "admin@wavy.test",
};
