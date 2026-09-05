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

const payoutCents = cents.min(1, "Payout must be at least 1 cent");

const title = z.string().trim().min(3, "Title is too short").max(120);

const platforms = z
  .array(z.enum(PLATFORMS))
  .min(1, "Pick at least one platform")
  .refine((v) => new Set(v).size === v.length, "Duplicate platform");

/**
 * The one period rule, shared by every schema below so the "end before start"
 * message cannot drift between the form and the procedure.
 */
const endsAfterStart = (v: { startsAt: Date; endsAt: Date }) => v.endsAt >= v.startsAt;
const endsAfterStartError = {
  message: "End date must not be before the start date",
  path: ["endsAt"],
};

export const campaignCreateSchema = z
  .object({
    title,
    platforms,
    payoutPer1kViews: payoutCents,
    totalBudget: cents,
    status: z.enum(CAMPAIGN_STATUSES).default("draft"),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine(endsAfterStart, endsAfterStartError);

export type CampaignCreateInput = z.input<typeof campaignCreateSchema>;
export type CampaignCreateValues = z.output<typeof campaignCreateSchema>;

export const campaignUpdateSchema = z
  .object({
    id: z.uuid(),
    title,
    platforms,
    payoutPer1kViews: payoutCents,
    totalBudget: cents,
    status: z.enum(CAMPAIGN_STATUSES),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine(endsAfterStart, endsAfterStartError);

export type CampaignUpdateInput = z.input<typeof campaignUpdateSchema>;

/**
 * Form-side schema, the counterpart of `submissionFormSchema`.
 *
 * `<input type="number">` and `<input type="date">` hand back strings, so this
 * parses them and then pipes into exactly the same `cents` / `title` /
 * `platforms` / period rules the procedures validate with. The rules live in
 * one place; only the input parsing differs.
 */
const centsFromInput = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(/^\d+$/, "Whole number of cents, digits only")
  .transform(Number);

const dayFromInput = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  // Dates are UTC everywhere in this app; see NOTES.md.
  .transform((day) => new Date(`${day}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), "Not a real date");

export const campaignFormSchema = z
  .object({
    title,
    platforms,
    payoutPer1kViews: centsFromInput.pipe(payoutCents),
    totalBudget: centsFromInput.pipe(cents),
    status: z.enum(CAMPAIGN_STATUSES),
    startsAt: dayFromInput,
    endsAt: dayFromInput,
  })
  .refine(endsAfterStart, endsAfterStartError);

/** What react-hook-form binds to: every field as the browser hands it over. */
export type CampaignFormInput = z.input<typeof campaignFormSchema>;
/** What `handleSubmit` receives: cents as integers, dates as UTC `Date`s. */
export type CampaignFormValues = z.output<typeof campaignFormSchema>;

export const campaignListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  /** Case-insensitive substring match on the title. */
  search: z.string().trim().max(120).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export type CampaignListInput = z.input<typeof campaignListSchema>;

export const campaignIdSchema = z.object({ id: z.uuid() });
