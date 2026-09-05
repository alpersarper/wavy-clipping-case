import { approveSubmission, rejectSubmission } from "@/server/services/approval";
import {
  createSubmission,
  getSubmissionForViewer,
  listMySubmissions,
  listReviewQueue,
} from "@/server/services/submissions";
import {
  adminProcedure,
  creatorProcedure,
  protectedProcedure,
  router,
} from "@/server/trpc/init";
import {
  submissionApproveSchema,
  submissionCreateSchema,
  submissionIdSchema,
  submissionListMineSchema,
  submissionRejectSchema,
  submissionReviewQueueSchema,
} from "@/shared/schemas/submission";

export const submissionRouter = router({
  create: creatorProcedure
    .input(submissionCreateSchema)
    .mutation(({ ctx, input }) =>
      createSubmission(ctx.db, {
        campaignId: input.campaignId,
        creatorId: ctx.user.id,
        postUrl: input.postUrl,
      }),
    ),

  /** The creator's own submissions. `creatorId` comes from the session only. */
  mine: creatorProcedure
    .input(submissionListMineSchema)
    .query(({ ctx, input }) =>
      listMySubmissions(ctx.db, { ...input, creatorId: ctx.user.id }),
    ),

  /** Ownership is enforced inside the service, not by the caller. */
  byId: protectedProcedure
    .input(submissionIdSchema)
    .query(({ ctx, input }) =>
      getSubmissionForViewer(ctx.db, { submissionId: input.id, viewer: ctx.user }),
    ),

  reviewQueue: adminProcedure
    .input(submissionReviewQueueSchema)
    .query(({ ctx, input }) => listReviewQueue(ctx.db, input)),

  approve: adminProcedure
    .input(submissionApproveSchema)
    .mutation(({ ctx, input }) =>
      approveSubmission(ctx.db, {
        submissionId: input.submissionId,
        reviewerId: ctx.user.id,
      }),
    ),

  reject: adminProcedure
    .input(submissionRejectSchema)
    .mutation(({ ctx, input }) =>
      rejectSubmission(ctx.db, {
        submissionId: input.submissionId,
        reviewerId: ctx.user.id,
        reason: input.reason,
      }),
    ),
});
