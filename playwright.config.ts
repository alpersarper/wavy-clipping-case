import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end config.
 *
 * The suite runs against `next dev` on its own port and its own Postgres
 * database (`wavy_e2e` on the compose container), so a run never touches the
 * database you are developing against. `tests/e2e/global-setup.ts` creates and
 * migrates it; every test reseeds first, which is what makes the suite
 * deterministic without a single `waitForTimeout`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://wavy:wavy@localhost:5433/wavy_e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // The tests share one database, so they run one at a time. Reseeding per test
  // is cheap; racing them against each other would not be.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    // dotenv never overrides an existing variable, so this wins over `.env`.
    env: { DATABASE_URL: E2E_DATABASE_URL },
  },
});
