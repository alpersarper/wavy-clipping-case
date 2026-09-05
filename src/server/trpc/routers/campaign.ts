import { TRPCError } from "@trpc/server";

import {
  createCampaign,
  getCampaign,
  getCampaignOverview,
  listActiveCampaigns,
  listCampaigns,
  updateCampaign,
} from "@/server/services/campaigns";
import { adminProcedure, protectedProcedure, router } from "@/server/trpc/init";
import {
  campaignCreateSchema,
  campaignIdSchema,
  campaignListSchema,
  campaignUpdateSchema,
} from "@/shared/schemas/campaign";

export const campaignRouter = router({
  /** Admin campaign list. Paginated, searched and filtered in Postgres. */
  list: adminProcedure
    .input(campaignListSchema)
    .query(({ ctx, input }) => listCampaigns(ctx.db, input)),

  /** What a creator browses. Only `active` campaigns accept submissions. */
  activeList: protectedProcedure.query(({ ctx }) => listActiveCampaigns(ctx.db)),

  byId: protectedProcedure.input(campaignIdSchema).query(async ({ ctx, input }) => {
    const campaign = await getCampaign(ctx.db, input.id);
    // Creators have no business reading unpublished campaigns.
    if (ctx.user.role !== "admin" && campaign.status === "draft") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    }
    return campaign;
  }),

  create: adminProcedure
    .input(campaignCreateSchema)
    .mutation(({ ctx, input }) => createCampaign(ctx.db, input)),

  update: adminProcedure
    .input(campaignUpdateSchema)
    .mutation(({ ctx, input }) => updateCampaign(ctx.db, input)),

  /** Approved views, budget spent/left and the zero-filled daily views series. */
  overview: adminProcedure
    .input(campaignIdSchema)
    .query(({ ctx, input }) => getCampaignOverview(ctx.db, input.id)),
});
