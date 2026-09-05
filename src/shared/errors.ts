/**
 * Application error codes that the UI is expected to branch on.
 *
 * These travel to the client inside `TRPCError.data.appError`, so a form can
 * react to "over budget" differently from "that URL is already submitted"
 * without string-matching a message.
 */
export const APP_ERROR_CODES = [
  "BUDGET_BELOW_COMMITTED",
  "BUDGET_EXCEEDED",
  "CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS",
  "CAMPAIGN_NOT_ACCEPTING_REVIEW",
  "DUPLICATE_SUBMISSION_URL",
  "PLATFORM_NOT_ALLOWED",
  "SUBMISSION_ALREADY_REVIEWED",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type AppErrorDetails = {
  BUDGET_BELOW_COMMITTED: {
    /** Cents already committed to approved submissions. */
    committedCents: number;
    /** The new budget that was rejected. */
    attemptedBudgetCents: number;
  };
  BUDGET_EXCEEDED: {
    /** Cents this approval would have committed. */
    requiredCents: number;
    /** Cents still available on the campaign budget. */
    remainingCents: number;
    totalBudgetCents: number;
  };
  CAMPAIGN_NOT_ACCEPTING_SUBMISSIONS: { status: string };
  CAMPAIGN_NOT_ACCEPTING_REVIEW: { status: string };
  DUPLICATE_SUBMISSION_URL: { normalizedUrl: string };
  PLATFORM_NOT_ALLOWED: { detected: string | null; allowed: string[] };
  SUBMISSION_ALREADY_REVIEWED: { status: string };
};

export type AppErrorPayload = {
  [K in AppErrorCode]: { code: K } & AppErrorDetails[K];
}[AppErrorCode];

/**
 * Thrown by the service layer. The tRPC error formatter unwraps it into
 * `shape.data.appError`; see `src/server/trpc/init.ts`.
 */
export class AppError extends Error {
  readonly payload: AppErrorPayload;

  constructor(payload: AppErrorPayload, message: string) {
    super(message);
    this.name = "AppError";
    this.payload = payload;
  }
}

function isAppErrorPayload(value: unknown): value is AppErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    APP_ERROR_CODES.includes((value as { code: AppErrorCode }).code)
  );
}

/**
 * Client-side counterpart to the tRPC error formatter: pulls the typed payload
 * back off a caught error so a form can branch on `BUDGET_EXCEEDED` rather than
 * on a message string.
 */
export function appErrorFrom(error: unknown): AppErrorPayload | null {
  const candidate = (error as { data?: { appError?: unknown } } | null)?.data?.appError;
  return isAppErrorPayload(candidate) ? candidate : null;
}

/**
 * "This row does not exist, or is not yours." Deliberately indistinguishable
 * from the ownership failure so that ids cannot be probed for existence.
 */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
