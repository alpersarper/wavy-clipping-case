import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import { createDb, createPool } from "@/server/db";
import { testDatabaseUrl } from "./helpers";

/**
 * Creates the test database if it is missing, then brings it up to the
 * committed migrations. Runs once for the whole integration project.
 */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach Postgres at ${adminUrl.host}. Run \`docker compose up -d\` first.\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    const existing = await admin.query("select 1 from pg_database where datname = $1", [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      // Identifier cannot be parameterised; the name comes from our own env.
      await admin.query(`create database "${databaseName.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }

  const pool = createPool(url.toString(), 2);
  try {
    await migrate(createDb(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
