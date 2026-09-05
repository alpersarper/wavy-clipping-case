import "dotenv/config";

import { ensureDatabase } from "../support/ensure-database";
import { testDatabaseUrl } from "./helpers";

/**
 * Creates the test database if it is missing, then brings it up to the
 * committed migrations. Runs once for the whole integration project.
 */
export default async function setup(): Promise<void> {
  await ensureDatabase(testDatabaseUrl());
}
