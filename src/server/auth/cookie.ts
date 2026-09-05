import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "wavy_session";

/** ~30 days. Long enough that the dev switcher is not annoying. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/**
 * `<userId>.<hmac>`. Deliberately minimal: per case section 4.1 the cookie only
 * has to be unforgeable, not a real session store. Nothing here grants
 * authority on its own -- role and ownership are enforced per procedure.
 */
export function signSession(userId: string, secret: string): string {
  return `${userId}.${hmac(userId, secret)}`;
}

export function verifySession(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const userId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = hmac(userId, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

/** Minimal `Cookie:` header parser -- avoids pulling in a dependency. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
