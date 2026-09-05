import { createDb, createPool } from "@/server/db";
import { env } from "@/server/env";
import { runIngest, utcDay } from "@/server/services/ingest";

/**
 * `pnpm ingest [YYYY-MM-DD]` -- fakes a daily metrics sync.
 *
 * Running it twice for the same day is a no-op. A submission that fails does
 * not stop the run; it is reported and the exit code is non-zero.
 */
async function main(): Promise<void> {
  const day = process.argv[2] ?? utcDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    console.error(`Usage: pnpm ingest [YYYY-MM-DD] (got "${day}")`);
    process.exit(2);
  }

  const pool = createPool(env().DATABASE_URL);
  try {
    const report = await runIngest(createDb(pool), { day });
    console.log(
      `[ingest ${report.day}] ${report.total} submissions: ` +
        `${report.inserted} inserted, ${report.skipped} already present, ` +
        `${report.failures.length} failed`,
    );
    for (const failure of report.failures) {
      console.error(`  ! ${failure.submissionId}: ${failure.message}`);
    }
    if (report.failures.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
