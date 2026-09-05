import { describe, expect, it } from "vitest";

import { readCookie, signSession, verifySession } from "@/server/auth/cookie";

const SECRET = "test-secret";
const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("session cookie", () => {
  it("round-trips a user id", () => {
    expect(verifySession(signSession(USER_ID, SECRET), SECRET)).toBe(USER_ID);
  });

  it("rejects a tampered user id", () => {
    const token = signSession(USER_ID, SECRET);
    const forged = token.replace(USER_ID, "22222222-2222-4222-8222-222222222222");
    expect(verifySession(forged, SECRET)).toBeNull();
  });

  it("rejects a signature made with another secret", () => {
    expect(verifySession(signSession(USER_ID, "other-secret"), SECRET)).toBeNull();
  });

  it("rejects unsigned and malformed values", () => {
    expect(verifySession(USER_ID, SECRET)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
    expect(verifySession(undefined, SECRET)).toBeNull();
    expect(verifySession(`${USER_ID}.`, SECRET)).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds the named cookie among others", () => {
    expect(readCookie("a=1; wavy_session=abc; b=2", "wavy_session")).toBe("abc");
  });

  it("does not match on a prefix", () => {
    expect(readCookie("wavy_session_other=abc", "wavy_session")).toBeUndefined();
  });

  it("handles an absent header", () => {
    expect(readCookie(null, "wavy_session")).toBeUndefined();
  });
});
