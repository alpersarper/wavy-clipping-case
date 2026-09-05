import { eq } from "drizzle-orm";

import type { DbHandle } from "@/server/db";
import { users, type UserRow } from "@/server/db/schema";
import { env } from "@/server/env";
import { readCookie, verifySession, SESSION_COOKIE } from "./cookie";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the signed cookie to a real user row. A valid signature over a
 * deleted user id still yields `null` -- the database is the authority.
 */
export async function getSessionUser(
  db: DbHandle,
  cookieHeader: string | null | undefined,
): Promise<UserRow | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  const userId = verifySession(token, env().AUTH_SECRET);
  // Guard the query: a signed-but-malformed id would otherwise reach Postgres
  // as an invalid uuid literal and throw instead of returning "logged out".
  if (!userId || !UUID_RE.test(userId)) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}
