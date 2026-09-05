import { createDb, createPool } from "@/server/db";
import { seed, SEED_SUMMARY } from "@/server/db/seed";
import { env } from "@/server/env";

async function main(): Promise<void> {
  const pool = createPool(env().DATABASE_URL);
  try {
    await seed(createDb(pool));
    console.log(
      `Seeded ${SEED_SUMMARY.users} users, ${SEED_SUMMARY.campaigns} campaigns and ` +
        `${SEED_SUMMARY.submissions} submissions. Start as ${SEED_SUMMARY.adminEmail}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
