import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { createDb, createPool, type Database } from "@/server/db";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";
import type { Platform } from "@/shared/platform";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.example to .env (see README).",
    );
  }
  return url;
}

export type TestDb = { db: Database; pool: Pool; close: () => Promise<void> };

/** `max` matters: the concurrency test needs two simultaneous transactions. */
export function connectTestDb(max = 6): TestDb {
  const pool = createPool(testDatabaseUrl(), max);
  return { db: createDb(pool), pool, close: () => pool.end() };
}

export async function resetDb(db: Database): Promise<void> {
  await db.execute(
    sql`truncate table "submission_metric", "submission", "campaign", "user" restart identity cascade`,
  );
}

let counter = 0;
function nextSuffix(): string {
  counter += 1;
  return String(counter).padStart(4, "0");
}

export async function makeUser(
  db: Database,
  role: "admin" | "creator",
): Promise<{ id: string; email: string; role: "admin" | "creator" }> {
  const [row] = await db
    .insert(users)
    .values({ email: `${role}-${nextSuffix()}@test.local`, role })
    .returning();
  return row;
}

export async function makeCampaign(
  db: Database,
  overrides: Partial<{
    title: string;
    platforms: Platform[];
    payoutPer1kViews: number;
    totalBudget: number;
    status: "draft" | "active" | "paused" | "completed";
    startsAt: Date;
    endsAt: Date;
  }> = {},
) {
  const [row] = await db
    .insert(campaigns)
    .values({
      title: overrides.title ?? `Campaign ${nextSuffix()}`,
      platforms: overrides.platforms ?? ["tiktok"],
      payoutPer1kViews: overrides.payoutPer1kViews ?? 100,
      totalBudget: overrides.totalBudget ?? 10_000,
      status: overrides.status ?? "active",
      startsAt: overrides.startsAt ?? new Date("2026-01-01T00:00:00Z"),
      endsAt: overrides.endsAt ?? new Date("2026-01-10T00:00:00Z"),
    })
    .returning();
  return row;
}

let urlCounter = 0;
export function uniqueTikTokUrl(): string {
  urlCounter += 1;
  // 19 digits, which is what a real TikTok video id looks like.
  return `https://www.tiktok.com/@tester/video/73${String(urlCounter).padStart(17, "0")}`;
}

/** A pending submission with a single metric row, i.e. priced and reviewable. */
export async function makeSubmission(
  db: Database,
  params: {
    campaignId: string;
    creatorId: string;
    views?: number;
    postUrl?: string;
    capturedAt?: string;
  },
) {
  const postUrl = params.postUrl ?? uniqueTikTokUrl();
  const [submission] = await db
    .insert(submissions)
    .values({
      campaignId: params.campaignId,
      creatorId: params.creatorId,
      postUrl,
      normalizedUrl: postUrl.toLowerCase(),
      platform: "tiktok",
    })
    .returning();

  if (params.views !== undefined) {
    await db.insert(submissionMetrics).values({
      submissionId: submission.id,
      capturedAt: params.capturedAt ?? "2026-01-02",
      views: params.views,
      likes: Math.floor(params.views * 0.05),
      comments: Math.floor(params.views * 0.005),
    });
  }

  return submission;
}
