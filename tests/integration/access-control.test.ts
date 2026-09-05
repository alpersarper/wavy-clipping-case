import { TRPCError } from "@trpc/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { UserRow } from "@/server/db/schema";
import { createCaller } from "@/server/trpc/root";
import { connectTestDb, makeCampaign, makeSubmission, makeUser, resetDb } from "./helpers";

const { db, close } = connectTestDb();

afterAll(close);
beforeEach(() => resetDb(db));

/** Calls procedures as a given user, exactly as the HTTP handler would. */
function callerFor(user: UserRow | null) {
  return createCaller({ db, user, resHeaders: new Headers() });
}

async function fullUser(id: string): Promise<UserRow> {
  const rows = await db.query.users.findMany();
  const found = rows.find((u) => u.id === id);
  if (!found) throw new Error("user missing");
  return found;
}

function codeOf(error: unknown): string | undefined {
  return error instanceof TRPCError ? error.code : undefined;
}

describe("access control", () => {
  it("rejects anonymous callers on everything but the switcher", async () => {
    const anon = callerFor(null);

    await expect(anon.campaign.list({ page: 1, pageSize: 10 })).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === "UNAUTHORIZED",
    );
    await expect(anon.submission.mine({ page: 1, pageSize: 10 })).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === "UNAUTHORIZED",
    );
    // The dev switcher itself has to stay reachable, or nobody can sign in.
    await expect(anon.auth.me()).resolves.toBeNull();
    await expect(anon.auth.users()).resolves.toEqual([]);
  });

  it("keeps admin-only procedures away from creators", async () => {
    const creator = await fullUser((await makeUser(db, "creator")).id);
    const admin = await makeUser(db, "admin");
    const campaign = await makeCampaign(db);
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    const caller = callerFor(creator);
    const forbidden = (e: unknown) => codeOf(e) === "FORBIDDEN";

    await expect(caller.campaign.list({ page: 1, pageSize: 10 })).rejects.toSatisfy(forbidden);
    await expect(caller.campaign.overview({ id: campaign.id })).rejects.toSatisfy(forbidden);
    await expect(
      caller.campaign.create({
        title: "Mine now",
        platforms: ["tiktok"],
        payoutPer1kViews: 100,
        totalBudget: 1_000,
        status: "active",
        startsAt: new Date("2026-01-01T00:00:00Z"),
        endsAt: new Date("2026-02-01T00:00:00Z"),
      }),
    ).rejects.toSatisfy(forbidden);
    await expect(
      caller.submission.reviewQueue({ campaignId: campaign.id, page: 1, pageSize: 10 }),
    ).rejects.toSatisfy(forbidden);
    await expect(caller.submission.approve({ submissionId: submission.id })).rejects.toSatisfy(
      forbidden,
    );
    await expect(
      caller.submission.reject({ submissionId: submission.id, reason: "no reason at all" }),
    ).rejects.toSatisfy(forbidden);

    // And the admin genuinely can do those things, so the test is not vacuous.
    await expect(
      callerFor(await fullUser(admin.id)).submission.reviewQueue({
        campaignId: campaign.id,
        page: 1,
        pageSize: 10,
      }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("does not let a creator reach another creator's submission by id", async () => {
    const alice = await fullUser((await makeUser(db, "creator")).id);
    const bob = await fullUser((await makeUser(db, "creator")).id);
    const campaign = await makeCampaign(db);

    const bobsSubmission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: bob.id,
      views: 5_000,
    });

    // Hand-crafted input: a valid id that simply is not Alice's.
    await expect(callerFor(alice).submission.byId({ id: bobsSubmission.id })).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === "NOT_FOUND",
    );

    // Bob sees his own, and an admin sees anyone's.
    await expect(callerFor(bob).submission.byId({ id: bobsSubmission.id })).resolves.toMatchObject({
      id: bobsSubmission.id,
    });
    const admin = await fullUser((await makeUser(db, "admin")).id);
    await expect(callerFor(admin).submission.byId({ id: bobsSubmission.id })).resolves.toMatchObject(
      { id: bobsSubmission.id },
    );
  });

  it("scopes 'my submissions' to the session, with no creator id to tamper with", async () => {
    const alice = await fullUser((await makeUser(db, "creator")).id);
    const bob = await fullUser((await makeUser(db, "creator")).id);
    const campaign = await makeCampaign(db);

    await makeSubmission(db, { campaignId: campaign.id, creatorId: alice.id, views: 1_000 });
    await makeSubmission(db, { campaignId: campaign.id, creatorId: bob.id, views: 2_000 });
    await makeSubmission(db, { campaignId: campaign.id, creatorId: bob.id, views: 3_000 });

    const asAlice = await callerFor(alice).submission.mine({ page: 1, pageSize: 10 });
    expect(asAlice.total).toBe(1);

    // Even smuggling extra keys into the input cannot widen the result set:
    // the procedure never reads a creator id from input.
    const tampered = await callerFor(alice).submission.mine({
      page: 1,
      pageSize: 10,
      ...({ creatorId: bob.id } as Record<string, unknown>),
    });
    expect(tampered.total).toBe(1);
    expect(tampered.items.every((item) => item.id !== undefined)).toBe(true);
  });

  it("hides draft campaigns from creators", async () => {
    const creator = await fullUser((await makeUser(db, "creator")).id);
    const admin = await fullUser((await makeUser(db, "admin")).id);
    const draft = await makeCampaign(db, { status: "draft" });

    await expect(callerFor(creator).campaign.byId({ id: draft.id })).rejects.toSatisfy(
      (e: unknown) => codeOf(e) === "NOT_FOUND",
    );
    await expect(callerFor(admin).campaign.byId({ id: draft.id })).resolves.toMatchObject({
      id: draft.id,
    });
    await expect(callerFor(creator).campaign.activeList()).resolves.toEqual([]);
  });

  it("refuses a rejection with no reason", async () => {
    const admin = await fullUser((await makeUser(db, "admin")).id);
    const creator = await makeUser(db, "creator");
    const campaign = await makeCampaign(db);
    const submission = await makeSubmission(db, {
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 1_000,
    });

    await expect(
      callerFor(admin).submission.reject({ submissionId: submission.id, reason: "  " }),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === "BAD_REQUEST");

    await expect(
      callerFor(admin).submission.reject({
        submissionId: submission.id,
        reason: "Watermark from another brand",
      }),
    ).resolves.toMatchObject({ submissionId: submission.id });
  });
});
