import { expect, test } from "@playwright/test";

import { reseed, SEED, signIn } from "./helpers";

test.beforeEach(async () => {
  await reseed();
});

/**
 * Money honesty on the creator's list. creator.one is seeded with one clip in
 * each state on a different campaign, so a single page shows all four:
 *
 *   rejected  n:4  Summer Sneaker Drop    1,200 views — earns nothing
 *   pending   n:16 Fitness App Challenge  8,100 views — an estimate
 *   approved  n:10 Skincare Routine Clips         — the committed amount
 *   paid      n:7  Indie Game Teaser              — the committed amount
 */
test("earnings read per status, and a rejected clip shows no money at all", async ({
  page,
}) => {
  await page.goto("/creator/submissions");
  await signIn(page, SEED.creatorOne);

  const row = (postUrl: string) =>
    page.getByTestId("submission-row").filter({ hasText: postUrl });
  const earnings = (postUrl: string) => row(postUrl).getByRole("cell").last();

  const REJECTED = "https://www.tiktok.com/@clipqueen/video/7301234567890123458";
  const PENDING = "https://www.instagram.com/reel/CxFitFam001/";
  const APPROVED = "https://www.instagram.com/p/CxGlowUp01/";
  const PAID = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  // Rejected: an em dash and "not earning" — never a dollar amount, because a
  // rejected clip earns nothing however many views it has.
  const rejected = earnings(REJECTED);
  await expect(rejected).toContainText("not earning");
  await expect(rejected).not.toContainText("$");
  // 1,200 views at $2.50/1k would have been $2.50 had it stayed pending.
  await expect(rejected).not.toContainText("2.50");
  // What a screen reader gets instead of a bare dash.
  await expect(rejected).toHaveText(/No earnings/);
  await expect(row(REJECTED)).toContainText("Rejected");
  // Its neighbour on the same campaign, approved, still shows real money — the
  // dash is about this clip's outcome, not a page-wide blank.
  await expect(
    earnings("https://www.tiktok.com/@clipqueen/video/7301234567890123456"),
  ).toContainText("$105.00");

  // Pending: an estimate off the current views.
  const pending = earnings(PENDING);
  await expect(pending).toContainText("estimated");
  await expect(pending).toContainText("$22.00");

  // Approved and paid: the committed amount, labelled by what it actually is.
  await expect(earnings(APPROVED)).toContainText("approved");
  await expect(earnings(APPROVED)).toContainText("$105.60");
  await expect(earnings(PAID)).toContainText("paid");
  await expect(earnings(PAID)).toContainText("$352.00");

  // The intro copy states the same contract the cells render.
  await expect(page.getByText(/nothing at all once it is rejected/)).toBeVisible();
});

test("the platforms group announces its own validation error", async ({ page }) => {
  await page.goto("/admin/campaigns/new");
  await signIn(page, SEED.admin);

  await page.getByLabel("Title").fill("Fieldset accessibility check");
  // The form starts with TikTok picked, so clear it to reach the rule. The
  // retry absorbs a click that lands before the checkbox has hydrated;
  // `uncheck` is a no-op once it is already off.
  const tiktok = page.getByRole("checkbox", { name: "TikTok" });
  await expect(async () => {
    await tiktok.uncheck();
    await expect(tiktok).not.toBeChecked();
  }).toPass({ timeout: 10_000 });
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page.getByText("Pick at least one platform")).toBeVisible();

  const group = page.getByRole("group", { name: "Platforms" });
  await expect(group).toHaveAttribute("aria-invalid", "true");

  // The failure has to be announced, not only coloured: resolve the group's
  // accessible description the way assistive tech does.
  const description = await group.evaluate((el) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
      .join(" "),
  );
  expect(description).toContain("Pick at least one platform");
  expect(description).toContain("Clips are only accepted from the platforms you pick");

  // Picking a platform clears both the message and the invalid state once the
  // group is left (the form validates on blur).
  await page.getByRole("checkbox", { name: "TikTok" }).check();
  await page.getByLabel("Title").click();
  await expect(page.getByText("Pick at least one platform")).toBeHidden();
  await expect(group).toHaveAttribute("aria-invalid", "false");
});
