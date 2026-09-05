import { expect, test } from "@playwright/test";

import { reseed, SEED, signIn, uniqueTikTokUrl } from "./helpers";

test.beforeEach(async () => {
  await reseed();
});

test("a creator submits a clip, and the same URL cannot be submitted twice", async ({
  page,
}) => {
  const postUrl = uniqueTikTokUrl("101");

  await page.goto("/creator/campaigns");
  await signIn(page, SEED.creatorOne);

  await page
    .getByRole("link", { name: "Submit a clip to Summer Sneaker Drop" })
    .click();

  await expect(page.getByRole("heading", { name: "Summer Sneaker Drop" })).toBeVisible();
  await page.getByLabel("Post URL").fill(postUrl);
  await page.getByRole("button", { name: "Submit clip" }).click();

  await expect(page.getByTestId("submit-success")).toContainText("pending review");

  // The per-campaign unique index is what rejects the second one; the typed
  // error comes back on the URL field rather than as a generic failure.
  await page.getByLabel("Post URL").fill(postUrl);
  await page.getByRole("button", { name: "Submit clip" }).click();

  await expect(
    page.getByText("That clip has already been submitted to this campaign."),
  ).toBeVisible();

  // It shows up once, pending, on the creator's own list.
  await page.goto("/creator/submissions");
  const row = page.getByTestId("submission-row").filter({ hasText: postUrl });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Pending");
});

test("a URL from a platform the campaign does not run on is refused inline", async ({
  page,
}) => {
  await page.goto(`/creator/campaigns/${SEED.energyCampaignId}`);
  await signIn(page, SEED.creatorOne);

  await expect(page.getByRole("heading", { name: "Energy Drink Launch" })).toBeVisible();
  await page.getByLabel("Post URL").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Submit clip" }).click();

  await expect(page.getByText("This campaign only accepts TikTok post URLs")).toBeVisible();
});
