import { expect, test } from "@playwright/test";

import { reseed, SEED, signIn } from "./helpers";

test.beforeEach(async () => {
  await reseed();
});

/**
 * Seeded state for "Summer Sneaker Drop": $2.50 per 1,000 views, $500.00
 * budget, $150.00 already committed, one pending clip at 9,900 views. That clip
 * is worth floor(9900 / 1000) * 250 = $22.50.
 */
test("approving from the review queue moves the budget and the creator's earnings", async ({
  page,
}) => {
  await page.goto(`/admin/campaigns/${SEED.sneakerCampaignId}`);
  await signIn(page, SEED.admin);

  await expect(page.getByText("$150.00")).toBeVisible();

  const row = page.getByTestId("review-row").filter({ hasText: "@editking" });
  await expect(row).toContainText("$22.50");
  await row.getByRole("button", { name: /^Approve/ }).click();

  await expect(page.getByText("Nothing to review")).toBeVisible();

  // Budget spent and budget left both move by the frozen payout.
  const overview = page.getByRole("region", { name: "Overview" });
  await expect(overview).toContainText("$172.50");
  await expect(overview).toContainText("$327.50");

  // And the creator sees the committed amount rather than an estimate.
  await page.goto("/creator/submissions");
  await signIn(page, SEED.creatorThree);

  const submission = page
    .getByTestId("submission-row")
    .filter({ hasText: "@editking" });
  await expect(submission).toContainText("Approved");
  await expect(submission).toContainText("$22.50");
});

test("rejecting requires a reason, and the reason reaches the creator", async ({
  page,
}) => {
  await page.goto(`/admin/campaigns/${SEED.energyCampaignId}`);
  await signIn(page, SEED.admin);

  const row = page.getByTestId("review-row").first();
  await row.getByRole("button", { name: /^Reject/ }).click();

  const dialog = page.getByRole("dialog", { name: "Reject this submission" });
  await expect(dialog).toBeVisible();

  // Empty reason is refused by the shared schema before anything is sent.
  await dialog.getByRole("button", { name: "Reject submission" }).click();
  await expect(
    dialog.getByText("Give the creator a usable reason (at least 5 characters)"),
  ).toBeVisible();

  await dialog.getByLabel("Reason").fill("The product never appears in the clip.");
  await dialog.getByRole("button", { name: "Reject submission" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Nothing to review")).toBeVisible();

  await page.goto("/creator/submissions");
  await signIn(page, SEED.creatorThree);

  const submission = page
    .getByTestId("submission-row")
    .filter({ hasText: "Energy Drink Launch" });
  await expect(submission).toContainText("Rejected");
  await expect(submission).toContainText("The product never appears in the clip.");
});
