import { expect, test } from "@playwright/test";

import { reseed, SEED, signIn } from "./helpers";

test.beforeEach(async () => {
  await reseed();
});

/**
 * "Winter Gear Teardown" is seeded with a $15.00 budget that its first approval
 * uses up entirely. The clip still pending on it is worth $12.00, which there is
 * no budget for — so the approval has to fail with the typed error, and the UI
 * has to say what to do about it.
 */
test("an over-budget approval surfaces the typed error instead of failing silently", async ({
  page,
}) => {
  await page.goto(`/admin/campaigns/${SEED.exhaustedCampaignId}`);
  await signIn(page, SEED.admin);

  const row = page.getByTestId("review-row").first();
  await row.getByRole("button", { name: /^Approve/ }).click();

  const alert = page.getByTestId("budget-exceeded-alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Not enough budget to approve this clip");
  // The amounts come off the typed payload, not a parsed message.
  await expect(alert).toContainText("$12.00");
  await expect(alert).toContainText("$0.00");
  await expect(alert).toContainText("$15.00");
  await expect(alert.getByRole("link", { name: "Edit budget" })).toBeVisible();

  // Nothing was written: the clip is still pending and the ledger is unchanged.
  await expect(page.getByTestId("review-row")).toHaveCount(1);
  const overview = page.getByRole("region", { name: "Overview" });
  await expect(overview).toContainText("$15.00");
  await expect(overview).toContainText("$0.00");
});
