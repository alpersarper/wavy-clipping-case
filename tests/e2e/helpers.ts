import { expect, type Page } from "@playwright/test";

import { createDb, createPool } from "@/server/db";
import { seed } from "@/server/db/seed";
import { E2E_DATABASE_URL } from "../../playwright.config";

/** Fixed users and campaigns from `src/server/db/seed.ts`, so tests can deep-link. */
export const SEED = {
  admin: { id: "00000000-0000-4000-8000-000000000001", email: "admin@wavy.test", role: "admin" },
  creatorOne: {
    id: "00000000-0000-4000-8000-000000000011",
    email: "creator.one@wavy.test",
    role: "creator",
  },
  creatorThree: {
    id: "00000000-0000-4000-8000-000000000013",
    email: "creator.three@wavy.test",
    role: "creator",
  },
  /** TikTok + Instagram, $2.50/1k, $500 budget, one pending clip at 9,900 views. */
  sneakerCampaignId: "00000000-0000-4000-8000-000000000101",
  /** TikTok only, one pending clip. */
  energyCampaignId: "00000000-0000-4000-8000-000000000102",
  /** Budget already exhausted; its remaining clip cannot be approved. */
  exhaustedCampaignId: "00000000-0000-4000-8000-000000000112",
} as const;

type SeedUser = { id: string; email: string; role: string };

/**
 * Restores the seed. Called before every test: the seed truncates first and
 * uses fixed ids, so each test starts from an identical database.
 */
export async function reseed(): Promise<void> {
  const pool = createPool(E2E_DATABASE_URL, 4);
  try {
    await seed(createDb(pool));
  } finally {
    await pool.end();
  }
}

/**
 * Signs in through the dev switcher — the only way this app hands out a
 * session — and waits until the page has re-rendered for that user.
 */
export async function signIn(page: Page, user: SeedUser): Promise<void> {
  const switcher = page.getByTestId("user-switcher");
  await expect(switcher).toBeEnabled();
  await switcher.selectOption({ label: `${user.email} (${user.role})` });
  await expect(switcher).toHaveValue(user.id);
}

/** A TikTok post URL that is unique per test run. */
export function uniqueTikTokUrl(suffix: string): string {
  return `https://www.tiktok.com/@e2e/video/73${suffix.padStart(17, "0")}`;
}
