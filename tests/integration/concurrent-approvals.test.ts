import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { campaigns, submissions } from "@/server/db/schema";
import { approveSubmission } from "@/server/services/approval";
import { AppError } from "@/shared/errors";
import { connectTestDb, makeCampaign, makeSubmission, makeUser, resetDb } from "./helpers";

const { db, close } = connectTestDb(8);

afterAll(close);
beforeEach(() => resetDb(db));

/** A promise that a test can resolve by hand, to interleave two transactions. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function ledger(campaignId: string) {
  const [totals] = await db
    .select({
      spent: sql<number>`coalesce(sum(${submissions.approvedPayoutCents}), 0)::int`,
      approved: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .where(
      and(eq(submissions.campaignId, campaignId), inArray(submissions.status, ["approved", "paid"])),
    );
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return {
    spent: Number(totals?.spent ?? 0),
    approved: Number(totals?.approved ?? 0),
    status: campaign.status,
  };
}

describe("two admins approving at the same moment", () => {
  /**
   * The budget covers exactly one of the two submissions.
   *
   * The interleaving is forced rather than hoped for: the first transaction
   * parks inside `afterCampaignLock` while still holding `SELECT ... FOR UPDATE`
   * on the campaign row, and the second is only started once we know the first
   * is holding it. The second therefore has to block on the lock, and reads the
   * budget only after the first has committed.
   */
  it("lets exactly one through, and the loser sees a typed over-budget error", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    // 10,000 views at 100 cents / 1k = 1,000 cents each. Budget fits one.
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 1_000 });

    const first = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });
    const second = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });

    const firstHoldsLock = deferred();
    const secondHasStarted = deferred();

    const firstApproval = approveSubmission(
      db,
      { submissionId: first.id, reviewerId: admin.id },
      {
        afterCampaignLock: async () => {
          firstHoldsLock.resolve();
          // Give the competing transaction time to reach the lock and block.
          await secondHasStarted.promise;
          await new Promise((r) => setTimeout(r, 150));
        },
      },
    );

    await firstHoldsLock.promise;

    const secondApproval = approveSubmission(db, {
      submissionId: second.id,
      reviewerId: admin.id,
    });
    secondHasStarted.resolve();

    const results = await Promise.allSettled([firstApproval, secondApproval]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppError);
    expect((reason as AppError).payload).toMatchObject({
      code: "BUDGET_EXCEEDED",
      requiredCents: 1_000,
      remainingCents: 0,
      totalBudgetCents: 1_000,
    });

    // First come, first served: the transaction that took the lock is the winner.
    expect((fulfilled[0] as PromiseFulfilledResult<{ submissionId: string }>).value.submissionId).toBe(
      first.id,
    );

    const after = await ledger(campaign.id);
    expect(after.approved).toBe(1);
    expect(after.spent).toBe(1_000);
    expect(after.status).toBe("completed");
  });

  /**
   * Same scenario without the forced interleave, so the test also covers
   * whatever ordering Postgres and the pool happen to pick.
   */
  it("never double-spends when many approvals are fired at once", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    // Room for three of the six 1,000-cent approvals.
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 3_000 });

    const created = [];
    for (let i = 0; i < 6; i++) {
      created.push(
        await makeSubmission(db, {
          campaignId: campaign.id,
          creatorId: creator.id,
          views: 10_000,
        }),
      );
    }

    const results = await Promise.allSettled(
      created.map((s) => approveSubmission(db, { submissionId: s.id, reviewerId: admin.id })),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    for (const rejection of results.filter((r) => r.status === "rejected")) {
      expect((rejection as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
      expect(((rejection as PromiseRejectedResult).reason as AppError).payload.code).toBe(
        "BUDGET_EXCEEDED",
      );
    }

    const after = await ledger(campaign.id);
    expect(after.approved).toBe(3);
    expect(after.spent).toBe(3_000);
    expect(after.status).toBe("completed");
  });

  /** The same submission approved twice concurrently must only be paid once. */
  it("cannot approve one submission twice", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db, { payoutPer1kViews: 100, totalBudget: 100_000 });
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 10_000,
    });

    const results = await Promise.allSettled([
      approveSubmission(db, { submissionId: submission.id, reviewerId: admin.id }),
      approveSubmission(db, { submissionId: submission.id, reviewerId: admin.id }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const reason = (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppError);
    expect((reason as AppError).payload).toMatchObject({ code: "SUBMISSION_ALREADY_REVIEWED" });

    const after = await ledger(campaign.id);
    expect(after.approved).toBe(1);
    expect(after.spent).toBe(1_000);
  });
});
