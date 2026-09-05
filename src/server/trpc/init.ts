import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { getDb, type Database } from "@/server/db";
import type { UserRow } from "@/server/db/schema";
import { getSessionUser } from "@/server/auth/session";
import { AppError, NotFoundError, type AppErrorPayload } from "@/shared/errors";

export type Context = {
  db: Database;
  user: UserRow | null;
  /** Response headers the request handler will send; used by the dev switcher. */
  resHeaders: Headers;
};

export type ContextOptions = {
  headers: Headers;
  resHeaders: Headers;
  db?: Database;
};

export async function createContext(opts: ContextOptions): Promise<Context> {
  const db = opts.db ?? getDb();
  const user = await getSessionUser(db, opts.headers.get("cookie"));
  return { db, user, resHeaders: opts.resHeaders };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  /**
   * Surfaces `AppError` payloads as `error.data.appError` so the client can
   * branch on a code (over budget, duplicate URL, ...) instead of parsing a
   * message string.
   */
  errorFormatter({ shape, error }) {
    const appError: AppErrorPayload | null =
      error.cause instanceof AppError ? error.cause.payload : null;
    return { ...shape, data: { ...shape.data, appError } };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Maps service-layer errors onto tRPC codes while keeping the typed payload on
 * `cause` for `errorFormatter`. Applied to every procedure, which is what lets
 * the service layer stay free of tRPC imports.
 */
const withDomainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;

  const cause = result.error.cause;
  if (cause instanceof AppError) {
    throw new TRPCError({ code: "CONFLICT", message: cause.message, cause });
  }
  if (cause instanceof NotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: cause.message, cause });
  }
  return result;
});

export const publicProcedure = t.procedure.use(withDomainErrors);

/** Any signed-in user. */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admins only" });
  }
  return next({ ctx });
});

export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "creator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Creators only" });
  }
  return next({ ctx });
});
