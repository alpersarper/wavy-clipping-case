import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/server/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/** A transaction handle; structurally the same query surface as `Database`. */
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

/**
 * Anything that can run queries. Services take this rather than importing the
 * singleton, so tests can hand them a test-database handle or a live
 * transaction.
 */
export type DbHandle = Database | Transaction;

export function createPool(connectionString: string, max = 10): Pool {
  return new Pool({ connectionString, max });
}

export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema });
}

let singleton: { pool: Pool; db: Database } | null = null;

/** Process-wide pool for the Next.js app. Scripts and tests build their own. */
export function getDb(): Database {
  if (!singleton) {
    const pool = createPool(env().DATABASE_URL);
    singleton = { pool, db: createDb(pool) };
  }
  return singleton.db;
}

export { schema };
