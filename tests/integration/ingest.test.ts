import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { submissionMetrics, submissions } from "@/server/db/schema";
import { approveSubmission } from "@/server/services/approval";
import { runIngest, type MetricSource } from "@/server/services/ingest";
import { connectTestDb, makeCampaign, makeSubmission, makeUser, resetDb } from "./helpers";

const { db, close } = connectTestDb();

afterAll(close);
beforeEach(() => resetDb(db));

async function metricsFor(submissionId: string) {
  return db
    .select()
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(asc(submissionMetrics.capturedAt));
}

describe("metrics ingestion", () => {
  it("writes one row per submission per day and is a no-op on a repeat run", async () => {
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db);
    const a = await makeSubmission(db, { campaignId: campaign.id, creatorId: creator.id });
    const b = await makeSubmission(db, { campaignId: campaign.id, creatorId: creator.id });

    const first = await runIngest(db, { day: "2026-02-01" });
    expect(first).toMatchObject({ total: 2, inserted: 2, skipped: 0, failures: [] });

    const before = await metricsFor(a.id);

    const second = await runIngest(db, { day: "2026-02-01" });
    expect(second).toMatchObject({ total: 2, inserted: 0, skipped: 2, failures: [] });

    // Byte-for-byte identical: a repeat run leaves the data as it was.
    expect(await metricsFor(a.id)).toEqual(before);
    expect(await metricsFor(b.id)).toHaveLength(1);
  });

  it("never lets views go down, even if the source reports a lower number", async () => {
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db);
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
    });

    const shrinking: MetricSource = ({ day }) =>
      day === "2026-02-01"
        ? { views: 50_000, likes: 100, comments: 10 }
        : { views: 10, likes: 0, comments: 0 };

    await runIngest(db, { day: "2026-02-01", source: shrinking });
    await runIngest(db, { day: "2026-02-02", source: shrinking });

    const rows = await metricsFor(submission.id);
    expect(rows.map((r) => r.views)).toEqual([50_000, 50_000]);
  });

  it("grows views across days with the default source", async () => {
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db);
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
    });

    for (const day of ["2026-02-01", "2026-02-02", "2026-02-03"]) {
      await runIngest(db, { day });
    }

    const views = (await metricsFor(submission.id)).map((r) => r.views);
    expect(views).toHaveLength(3);
    expect(views[1]).toBeGreaterThan(views[0]);
    expect(views[2]).toBeGreaterThan(views[1]);
  });

  it("finishes the run when one submission blows up, and reports the failure", async () => {
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db);

    const created = [];
    for (let i = 0; i < 4; i++) {
      created.push(await makeSubmission(db, { campaignId: campaign.id, creatorId: creator.id }));
    }
    const doomed = created[1];

    const flaky: MetricSource = ({ submissionId }) => {
      if (submissionId === doomed.id) throw new Error("upstream API returned 500");
      return { views: 5_000, likes: 100, comments: 10 };
    };

    const report = await runIngest(db, { day: "2026-02-01", source: flaky });

    expect(report.total).toBe(4);
    expect(report.inserted).toBe(3);
    expect(report.failures).toEqual([
      { submissionId: doomed.id, message: "upstream API returned 500" },
    ]);

    // The other three really were written.
    for (const submission of created) {
      const rows = await metricsFor(submission.id);
      expect(rows).toHaveLength(submission.id === doomed.id ? 0 : 1);
    }

    // A later run picks the failed one up rather than losing the day.
    const retry = await runIngest(db, { day: "2026-02-01" });
    expect(retry).toMatchObject({ inserted: 1, skipped: 3, failures: [] });
  });

  it("skips rejected submissions but keeps pending ones measured", async () => {
    const admin = await makeUser(db, "admin");
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db);

    const pending = await makeSubmission(db, { campaignId: campaign.id, creatorId: creator.id });
    const approved = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 3_000,
    });
    const rejected = await makeSubmission(db, { campaignId: campaign.id, creatorId: creator.id });

    await approveSubmission(db, { submissionId: approved.id, reviewerId: admin.id });
    await db
      .update(submissions)
      .set({ status: "rejected", rejectionReason: "off brief" })
      .where(eq(submissions.id, rejected.id));

    const report = await runIngest(db, { day: "2026-02-01" });

    expect(report.total).toBe(2);
    expect(await metricsFor(pending.id)).toHaveLength(1);
    expect(await metricsFor(rejected.id)).toHaveLength(0);
  });
});
