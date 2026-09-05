import { expect, test } from "@playwright/test";

import { reseed, SEED, signIn } from "./helpers";

test.beforeEach(async () => {
  await reseed();
});

test("an admin creates a campaign and finds it in the list", async ({ page }) => {
  await page.goto("/admin/campaigns");
  await signIn(page, SEED.admin);

  await expect(page.getByRole("heading", { name: "Campaigns", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "New campaign" }).first().click();

  await expect(page.getByRole("heading", { name: "New campaign" })).toBeVisible();
  await page.getByLabel("Title").fill("E2E Neon Nights");
  await page.getByLabel("Payout per 1,000 views (cents)").fill("300");
  await page.getByLabel("Total budget (cents)").fill("100000");
  await page.getByRole("checkbox", { name: "Instagram" }).check();

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Active" }).click();

  await page.getByRole("button", { name: "Create campaign" }).click();

  // Lands on the new campaign's detail page.
  await expect(page.getByRole("heading", { name: "E2E Neon Nights" })).toBeVisible();
  await expect(page.getByText("$3.00 per 1,000 views")).toBeVisible();

  // And the server-side search finds it in the list.
  await page.goto("/admin/campaigns");
  await page.getByLabel("Search by title").fill("Neon");
  await expect(
    page.getByRole("link", { name: "E2E Neon Nights", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Summer Sneaker Drop", exact: true }),
  ).toHaveCount(0);

  // The status filter is applied in Postgres too: the campaign is active, so
  // filtering to draft must drop it.
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Draft" }).click();
  await expect(page.getByText("No campaigns match those filters")).toBeVisible();
});

test("field-level validation blocks an impossible campaign", async ({ page }) => {
  await page.goto("/admin/campaigns/new");
  await signIn(page, SEED.admin);

  await page.getByLabel("Title").fill("no");
  await page.getByLabel("Payout per 1,000 views (cents)").fill("0");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page.getByText("Title is too short")).toBeVisible();
  await expect(page.getByText("Payout must be at least 1 cent")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new$/);
});
