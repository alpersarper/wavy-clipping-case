import { z } from "zod";

import { PLATFORMS } from "@/shared/platform";

export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Money fields are integer cents. Never a float, never a formatted string. */
const cents = z
  .number()
  .int("Must be a whole number of cents")
  .min(0, "Cannot be negative")
  .max(2_000_000_000, "Unrealistically large");

const period = {
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
};

export const campaignCreateSchema = z
  .object({
    title: z.string().trim().min(3, "Title is too short").max(120),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, "Pick at least one platform")
      .refine((v) => new Set(v).size === v.length, "Duplicate platform"),
    payoutPer1kViews: cents.min(1, "Payout must be at least 1 cent"),
    totalBudget: cents,
    status: z.enum(CAMPAIGN_STATUSES).default("draft"),
    ...period,
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: "End date must not be before the start date",
    path: ["endsAt"],
  });

export type CampaignCreateInput = z.input<typeof campaignCreateSchema>;
export type CampaignCreateValues = z.output<typeof campaignCreateSchema>;

export const campaignUpdateSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(3, "Title is too short").max(120),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, "Pick at least one platform")
      .refine((v) => new Set(v).size === v.length, "Duplicate platform"),
    payoutPer1kViews: cents.min(1, "Payout must be at least 1 cent"),
    totalBudget: cents,
    status: z.enum(CAMPAIGN_STATUSES),
    ...period,
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: "End date must not be before the start date",
    path: ["endsAt"],
  });

export type CampaignUpdateInput = z.input<typeof campaignUpdateSchema>;

export const campaignListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  /** Case-insensitive substring match on the title. */
  search: z.string().trim().max(120).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export type CampaignListInput = z.input<typeof campaignListSchema>;

export const campaignIdSchema = z.object({ id: z.uuid() });
