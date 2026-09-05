import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database, DbHandle } from "@/server/db";
import {
  campaigns,
  submissions,
  users,
  type SubmissionRow,
  type UserRow,
} from "@/server/db/schema";
import { AppError, NotFoundError } from "@/shared/errors";
import { calculateEarningsCents } from "@/shared/payout";
import { detectPlatform, normalizePostUrl, type Platform } from "@/shared/platform";
import type {
  submissionListMineSchema,
  submissionReviewQueueSchema,
} from "@/shared/schemas/submission";

/** Latest known view count for a submission, as a correlated scalar subquery. */
const latestViews = sql<number>`coalesce((
  select m.views
  from submission_metric m
  where m.submission_id = ${submissions.id}
  order by m.captured_at desc
  limit 1
), 0)::int`;

const PG_UNIQUE_VIOLATION = "23505";

export async function createSubmission(
  db: Database,
  params: { campaignId: string; creatorId: string; postUrl: string },
): Promise<SubmissionRow> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError("Campaign not found");

  if (campaign.status !== "active") {
    throw new AppError(
      { code: "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS", status: campaign.status },
      `Campaign is ${campaign.status} and is not accepting submissions`,
    );
  }

  // The platform is derived from the URL, never taken from the client.
  const platform = detectPlatform(params.postUrl);
  const allowed = campaign.platforms as Platform[];
  if (!platform || !allowed.includes(platform)) {
    throw new AppError(
      { code: "PLATFORM_NOT_ALLOWED", detected: platform, allowed },
      platform
        ? `This campaign does not run on ${platform}`
        : "That does not look like a supported post URL",
    );
  }

  const normalizedUrl = normalizePostUrl(params.postUrl);

  try {
    const [row] = await db
      .insert(submissions)
      .values({
        campaignId: campaign.id,
        creatorId: params.creatorId,
        postUrl: params.postUrl.trim(),
        normalizedUrl,
        platform,
      })
      .returning();
    return row;
  } catch (error) {
    // The unique index is the authority on duplicates, not a prior SELECT:
    // that keeps two simultaneous submissions of the same clip honest.
    if (isUniqueViolation(error)) {
      throw new AppError(
        { code: "DUPLICATE_SUBMISSION_URL", normalizedUrl },
        "That post has already been submitted to this campaign",
      );
    }
    throw error;
  }
}

/**
 * Drizzle wraps driver errors in a `DrizzleQueryError`, so the Postgres
 * SQLSTATE lives on the cause rather than the thrown error. Walk the chain.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type CreatorSubmission = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  postUrl: string;
  platform: Platform;
  status: SubmissionRow["status"];
  rejectionReason: string | null;
  currentViews: number;
  /** Live estimate from the latest metric row. What a pending clip *would* earn. */
  estimatedEarningsCents: number;
  /** Cents actually committed at approval time. Null while pending or rejected. */
  approvedPayoutCents: number | null;
  createdAt: Date;
};

/**
 * A creator's own submissions.
 *
 * There is deliberately no `creatorId` input: the caller's identity comes from
 * the session, so no hand-crafted input can widen the result set.
 */
export async function listMySubmissions(
  db: DbHandle,
  params: { creatorId: string } & z.output<typeof submissionListMineSchema>,
): Promise<{ items: CreatorSubmission[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const where = and(
    eq(submissions.creatorId, params.creatorId),
    params.status ? eq(submissions.status, params.status) : undefined,
  );

  const [totalRow] = await db.select({ value: count() }).from(submissions).where(where);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      id: submissions.id,
      campaignId: submissions.campaignId,
      campaignTitle: campaigns.title,
      payoutPer1kViews: campaigns.payoutPer1kViews,
      postUrl: submissions.postUrl,
      platform: submissions.platform,
      status: submissions.status,
      rejectionReason: submissions.rejectionReason,
      approvedPayoutCents: submissions.approvedPayoutCents,
      createdAt: submissions.createdAt,
      currentViews: latestViews,
    })
    .from(submissions)
    .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
    .where(where)
    .orderBy(desc(submissions.createdAt), desc(submissions.id))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return {
    items: rows.map(toCreatorSubmission),
    total,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

type SubmissionJoinRow = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  payoutPer1kViews: number;
  postUrl: string;
  platform: Platform;
  status: SubmissionRow["status"];
  rejectionReason: string | null;
  approvedPayoutCents: number | null;
  createdAt: Date;
  currentViews: number;
};

function toCreatorSubmission(row: SubmissionJoinRow): CreatorSubmission {
  const currentViews = Number(row.currentViews);
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignTitle: row.campaignTitle,
    postUrl: row.postUrl,
    platform: row.platform,
    status: row.status,
    rejectionReason: row.rejectionReason,
    currentViews,
    estimatedEarningsCents: calculateEarningsCents(currentViews, row.payoutPer1kViews),
    approvedPayoutCents: row.approvedPayoutCents,
    createdAt: row.createdAt,
  };
}

export type ReviewQueueItem = CreatorSubmission & {
  creatorEmail: string;
  /** Cents this submission would commit if approved right now. */
  pendingPayoutCents: number;
};

export async function listReviewQueue(
  db: DbHandle,
  input: z.output<typeof submissionReviewQueueSchema>,
): Promise<{ items: ReviewQueueItem[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const where = and(
    eq(submissions.campaignId, input.campaignId),
    eq(submissions.status, "pending"),
  );

  const [totalRow] = await db.select({ value: count() }).from(submissions).where(where);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      id: submissions.id,
      campaignId: submissions.campaignId,
      campaignTitle: campaigns.title,
      payoutPer1kViews: campaigns.payoutPer1kViews,
      postUrl: submissions.postUrl,
      platform: submissions.platform,
      status: submissions.status,
      rejectionReason: submissions.rejectionReason,
      approvedPayoutCents: submissions.approvedPayoutCents,
      createdAt: submissions.createdAt,
      currentViews: latestViews,
      creatorEmail: users.email,
    })
    .from(submissions)
    .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
    .innerJoin(users, eq(users.id, submissions.creatorId))
    .where(where)
    .orderBy(desc(submissions.createdAt), desc(submissions.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    items: rows.map((row) => {
      const base = toCreatorSubmission(row);
      return {
        ...base,
        creatorEmail: row.creatorEmail,
        pendingPayoutCents: base.estimatedEarningsCents,
      };
    }),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

/**
 * One submission, scoped to who is asking.
 *
 * A creator gets their own submissions and nothing else. The "not yours" and
 * "does not exist" cases return the same `NotFoundError` on purpose, so the
 * endpoint cannot be used to test whether an id exists.
 */
export async function getSubmissionForViewer(
  db: DbHandle,
  params: { submissionId: string; viewer: UserRow },
): Promise<CreatorSubmission> {
  const where =
    params.viewer.role === "admin"
      ? eq(submissions.id, params.submissionId)
      : and(
          eq(submissions.id, params.submissionId),
          eq(submissions.creatorId, params.viewer.id),
        );

  const [row] = await db
    .select({
      id: submissions.id,
      campaignId: submissions.campaignId,
      campaignTitle: campaigns.title,
      payoutPer1kViews: campaigns.payoutPer1kViews,
      postUrl: submissions.postUrl,
      platform: submissions.platform,
      status: submissions.status,
      rejectionReason: submissions.rejectionReason,
      approvedPayoutCents: submissions.approvedPayoutCents,
      createdAt: submissions.createdAt,
      currentViews: latestViews,
    })
    .from(submissions)
    .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
    .where(where)
    .limit(1);

  if (!row) throw new NotFoundError("Submission not found");
  return toCreatorSubmission(row);
}
