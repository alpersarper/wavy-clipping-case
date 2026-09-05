import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { users } from "@/server/db/schema";
import { env } from "@/server/env";
import { buildSessionCookie, SESSION_COOKIE, signSession } from "@/server/auth/cookie";
import { publicProcedure, router } from "@/server/trpc/init";

/**
 * Auth is intentionally a signed cookie plus a switcher (case section 4.1).
 * These procedures will hand a session to any seeded user, which is fine for a
 * take-home and would obviously not ship. Every *other* procedure enforces role
 * and ownership on top of whatever this returns.
 */
export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  /** Populates the dev user switcher. */
  users: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .orderBy(asc(users.role), asc(users.email)),
  ),

  switchUser: publicProcedure
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown user" });
      }

      ctx.resHeaders.append(
        "set-cookie",
        buildSessionCookie(
          signSession(user.id, env().AUTH_SECRET),
          process.env.NODE_ENV === "production",
        ),
      );
      return user;
    }),

  signOut: publicProcedure.mutation(({ ctx }) => {
    ctx.resHeaders.append(
      "set-cookie",
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    return { ok: true };
  }),
});
