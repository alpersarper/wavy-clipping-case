import { desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db";
import { submissionMetrics, submissions } from "@/server/db/schema";

export type MetricSnapshot = { views: number; likes: number; comments: number };

/**
 * Where a day's numbers come from. In production this is a third-party API
 * call; here it is a deterministic fake. Injected so tests can make one
 * submission blow up without touching the rest of the run.
 */
export type MetricSource = (input: {
  submissionId: string;
  day: string;
  previous: MetricSnapshot | null;
}) => Promise<MetricSnapshot> | MetricSnapshot;

export type IngestReport = {
  day: string;
  /** Submissions considered this run. */
  total: number;
  inserted: number;
  /** Already had a row for `day` -- a repeat run lands entirely here. */
  skipped: number;
  failures: { submissionId: string; message: string }[];
};

/**
 * Statuses that get a daily metric row.
 *
 * Section 4.5 says "approved", but a submission has to carry views *before* it
 * is reviewed, otherwise every approval would price at zero and the budget
 * ceiling could never bind. So: everything still in play, i.e. everything not
 * rejected. See NOTES.md.
 */
const INGESTED_STATUSES = ["pending", "approved", "paid"] as const;

export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** FNV-1a. Gives each submission a stable, boring growth curve. */
function hash32(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic stand-in for a platform API. Same submission + day = same numbers. */
export const fakeMetricSource: MetricSource = ({ submissionId, day, previous }) => {
  const seed = hash32(`${submissionId}:${day}`);
  const growth = 250 + (seed % 12_000);
  const views = (previous?.views ?? 0) + growth;
  return {
    views,
    likes: Math.floor(views * 0.06),
    comments: Math.floor(views * 0.006),
  };
};

/**
 * Writes one metric row per in-play submission for `day`.
 *
 * Idempotent: the `(submission_id, captured_at)` unique index means a second
 * run for the same day inserts nothing and changes nothing. Failure of one
 * submission is caught and reported; the rest of the run continues.
 */
export async function runIngest(
  db: Database,
  opts: { day?: string; source?: MetricSource } = {},
): Promise<IngestReport> {
  const day = opts.day ?? utcDay();
  const source = opts.source ?? fakeMetricSource;

  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(inArray(submissions.status, [...INGESTED_STATUSES]))
    .orderBy(submissions.id);

  const report: IngestReport = {
    day,
    total: rows.length,
    inserted: 0,
    skipped: 0,
    failures: [],
  };

  for (const { id } of rows) {
    try {
      const [previous] = await db
        .select({
          views: submissionMetrics.views,
          likes: submissionMetrics.likes,
          comments: submissionMetrics.comments,
        })
        .from(submissionMetrics)
        .where(eq(submissionMetrics.submissionId, id))
        .orderBy(desc(submissionMetrics.capturedAt))
        .limit(1);

      const snapshot = await source({
        submissionId: id,
        day,
        previous: previous ?? null,
      });

      // Views only ever go up, whatever the source claims.
      const monotonic: MetricSnapshot = {
        views: Math.max(snapshot.views, previous?.views ?? 0),
        likes: Math.max(snapshot.likes, previous?.likes ?? 0),
        comments: Math.max(snapshot.comments, previous?.comments ?? 0),
      };

      const inserted = await db
        .insert(submissionMetrics)
        .values({ submissionId: id, capturedAt: day, ...monotonic })
        .onConflictDoNothing({
          target: [submissionMetrics.submissionId, submissionMetrics.capturedAt],
        })
        .returning({ id: submissionMetrics.id });

      if (inserted.length > 0) report.inserted += 1;
      else report.skipped += 1;
    } catch (error) {
      report.failures.push({
        submissionId: id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
