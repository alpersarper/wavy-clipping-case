import { z } from "zod";

import { detectPlatform, PLATFORM_LABELS, type Platform } from "@/shared/platform";

export const SUBMISSION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "paid",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const postUrl = z
  .string()
  .trim()
  .min(1, "Paste the post URL")
  .max(500, "That URL is suspiciously long")
  .refine((url) => detectPlatform(url) !== null, {
    message: "Not a recognisable TikTok, Instagram or YouTube post URL",
  });

/** What the tRPC procedure accepts. Platform is derived server-side, never trusted. */
export const submissionCreateSchema = z.object({
  campaignId: z.uuid(),
  postUrl,
});

export type SubmissionCreateInput = z.input<typeof submissionCreateSchema>;

/**
 * Form-side schema. Same rules as the server plus the campaign's own platform
 * list, so the creator sees "this campaign is TikTok only" before submitting
 * rather than after. The server re-checks it against the database either way.
 */
export function submissionFormSchema(allowed: readonly Platform[]) {
  return z.object({
    campaignId: z.uuid(),
    postUrl: postUrl.refine(
      (url) => {
        const platform = detectPlatform(url);
        return platform !== null && allowed.includes(platform);
      },
      {
        message: `This campaign only accepts ${allowed
          .map((p) => PLATFORM_LABELS[p])
          .join(" and ")} post URLs`,
      },
    ),
  });
}

export const submissionListMineSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  status: z.enum(SUBMISSION_STATUSES).optional(),
});

export const submissionReviewQueueSchema = z.object({
  campaignId: z.uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
});

export const submissionApproveSchema = z.object({
  submissionId: z.uuid(),
});

/** Rejecting always requires a reason -- enforced here and by a CHECK constraint. */
export const rejectionReasonSchema = z
  .string()
  .trim()
  .min(5, "Give the creator a usable reason (at least 5 characters)")
  .max(500, "Keep the reason under 500 characters");

export const submissionRejectSchema = z.object({
  submissionId: z.uuid(),
  reason: rejectionReasonSchema,
});

/** What the reject dialog binds to; the same rule the procedure enforces. */
export const rejectFormSchema = z.object({ reason: rejectionReasonSchema });

export type RejectFormValues = z.output<typeof rejectFormSchema>;

export const submissionIdSchema = z.object({ id: z.uuid() });
