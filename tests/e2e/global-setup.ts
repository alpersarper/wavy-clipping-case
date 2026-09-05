import { E2E_DATABASE_URL } from "../../playwright.config";
import { ensureDatabase } from "../support/ensure-database";

/**
 * Creates the e2e database if it is missing and brings it up to the committed
 * migrations. Seeding happens per test (see `reseed` in `helpers.ts`) so that
 * every test starts from the same known rows.
 */
export default async function globalSetup(): Promise<void> {
  await ensureDatabase(E2E_DATABASE_URL);
}
