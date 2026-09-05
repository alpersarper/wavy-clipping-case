import { createCallerFactory, router } from "@/server/trpc/init";
import { authRouter } from "./routers/auth";
import { campaignRouter } from "./routers/campaign";
import { submissionRouter } from "./routers/submission";

export const appRouter = router({
  auth: authRouter,
  campaign: campaignRouter,
  submission: submissionRouter,
});

export type AppRouter = typeof appRouter;

/** Used by tests and server components to call procedures without HTTP. */
export const createCaller = createCallerFactory(appRouter);
