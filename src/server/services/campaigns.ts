import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database, DbHandle } from "@/server/db";
import { campaigns, submissions, type CampaignRow } from "@/server/db/schema";
import { AppError, NotFoundError } from "@/shared/errors";
import { remainingBudgetCents } from "@/shared/payout";
import type {
  campaignCreateSchema,
  campaignListSchema,
  campaignUpdateSchema,
} from "@/shared/schemas/campaign";

export type CampaignListResult = {
  items: CampaignRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** Server-side pagination: one COUNT plus one windowed page, never a full scan into JS. */
export async function listCampaigns(
  db: DbHandle,
  input: z.output<typeof campaignListSchema>,
): Promise<CampaignListResult> {
  const filters = [
    input.status ? eq(campaigns.status, input.status) : undefined,
    input.search ? ilike(campaigns.title, `%${escapeLike(input.search)}%`) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(campaigns).where(where);
  const total = totalRow?.value ?? 0;

  const items = await db
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.createdAt), asc(campaigns.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

/** `%` and `_` in a search box are literal characters, not wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function getCampaign(db: DbHandle, id: string): Promise<CampaignRow> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) throw new NotFoundError("Campaign not found");
  return campaign;
}

export async function listActiveCampaigns(db: DbHandle): Promise<CampaignRow[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, "active"))
    .orderBy(desc(campaigns.createdAt), asc(campaigns.id));
}

export async function createCampaign(
  db: Database,
  input: z.output<typeof campaignCreateSchema>,
): Promise<CampaignRow> {
  const [row] = await db.insert(campaigns).values(input).returning();
  return row;
}

/**
 * Edits a campaign.
 *
 * Takes the same campaign row lock as an approval, because lowering
 * `total_budget` below what is already committed would break the one invariant
 * this whole service exists to hold: a campaign never pays out more than its
 * budget. An edit racing an approval must see that approval's spend.
 */
export async function updateCampaign(
  db: Database,
  input: z.output<typeof campaignUpdateSchema>,
): Promise<CampaignRow> {
  const { id, ...values } = input;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1)
      .for("update");
    if (!existing) throw new NotFoundError("Campaign not found");

    const [spentRow] = await tx
      .select({
        spent: sql<number>`coalesce(sum(${submissions.approvedPayoutCents}), 0)::int`,
      })
      .from(submissions)
      .where(
        and(eq(submissions.campaignId, id), inArray(submissions.status, ["approved", "paid"])),
      );
    const committedCents = Number(spentRow?.spent ?? 0);

    if (values.totalBudget < committedCents) {
      throw new AppError(
        {
          code: "BUDGET_BELOW_COMMITTED",
          committedCents,
          attemptedBudgetCents: values.totalBudget,
        },
        "Budget cannot be lowered below what is already committed to approved submissions",
      );
    }

    const [row] = await tx
      .update(campaigns)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return row;
  });
}

export type CampaignOverview = {
  campaign: CampaignRow;
  /** Latest known view count summed across approved and paid submissions. */
  totalApprovedViews: number;
  approvedSubmissionCount: number;
  budgetSpentCents: number;
  budgetLeftCents: number;
  /** One entry per calendar day of the campaign period, zero-filled. */
  dailyViews: { day: string; views: number }[];
};

/**
 * Campaign overview.
 *
 * `dailyViews` is *new* views per day, not the running total: metric rows are
 * cumulative snapshots, so a day is worth `views - previous snapshot`. That
 * makes a day with no metrics an honest zero rather than a drop to the axis,
 * which matters because the period is expected to contain such days.
 */
export async function getCampaignOverview(
  db: DbHandle,
  campaignId: string,
): Promise<CampaignOverview> {
  const campaign = await getCampaign(db, campaignId);

  const [totals] = await db
    .select({
      spent: sql<number>`coalesce(sum(${submissions.approvedPayoutCents}), 0)::int`,
      approvedCount: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.campaignId, campaignId),
        inArray(submissions.status, ["approved", "paid"]),
      ),
    );

  const budgetSpentCents = totals?.spent ?? 0;

  const viewsResult = await db.execute<{ total_views: number }>(sql`
    select coalesce(sum(m.views), 0)::int as total_views
    from submission s
    join lateral (
      select views
      from submission_metric
      where submission_id = s.id
      order by captured_at desc
      limit 1
    ) m on true
    where s.campaign_id = ${campaignId}
      and s.status in ('approved', 'paid')
  `);

  const seriesResult = await db.execute<{ day: string; views: number }>(sql`
    with period as (
      select generate_series(
        (${campaign.startsAt.toISOString()}::timestamptz at time zone 'UTC')::date,
        (${campaign.endsAt.toISOString()}::timestamptz at time zone 'UTC')::date,
        interval '1 day'
      )::date as day
    ),
    deltas as (
      select
        m.captured_at as day,
        greatest(
          m.views - coalesce(
            lag(m.views) over (partition by m.submission_id order by m.captured_at),
            0
          ),
          0
        ) as views
      from submission_metric m
      join submission s on s.id = m.submission_id
      where s.campaign_id = ${campaignId}
        and s.status in ('approved', 'paid')
    )
    select
      to_char(p.day, 'YYYY-MM-DD') as day,
      coalesce(sum(d.views), 0)::int as views
    from period p
    left join deltas d on d.day = p.day
    group by p.day
    order by p.day
  `);

  return {
    campaign,
    totalApprovedViews: Number(viewsResult.rows[0]?.total_views ?? 0),
    approvedSubmissionCount: Number(totals?.approvedCount ?? 0),
    budgetSpentCents,
    budgetLeftCents: remainingBudgetCents(campaign.totalBudget, budgetSpentCents),
    dailyViews: seriesResult.rows.map((r) => ({ day: r.day, views: Number(r.views) })),
  };
}
