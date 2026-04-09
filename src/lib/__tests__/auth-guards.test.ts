import { describe, it, expect } from "vitest";
import {
  AuthError,
  requireRole,
  authErrorToResult,
  type SessionLike,
} from "../auth-guards";

function session(role: SessionLike["role"]): SessionLike {
  return {
    memberId: "m1",
    organisationId: "o1",
    role,
    firstName: "X",
    lastName: "Y",
    email: "x@y",
  };
}

describe("AuthError", () => {
  it("has a code field that discriminates UNAUTHORISED vs FORBIDDEN", () => {
    const unauth = new AuthError("UNAUTHORISED", "signed out");
    const forbid = new AuthError("FORBIDDEN", "wrong role");
    expect(unauth.code).toBe("UNAUTHORISED");
    expect(forbid.code).toBe("FORBIDDEN");
    expect(unauth).toBeInstanceOf(Error);
  });
});

describe("requireRole", () => {
  const ORDER = ["MEMBER", "BOOKING_OFFICER", "COMMITTEE", "ADMIN"] as const;

  it("passes when session role equals required", () => {
    for (const r of ORDER) {
      expect(() => requireRole(session(r), r)).not.toThrow();
    }
  });

  it("passes when session role is above required", () => {
    expect(() => requireRole(session("ADMIN"), "COMMITTEE")).not.toThrow();
    expect(() => requireRole(session("COMMITTEE"), "BOOKING_OFFICER")).not.toThrow();
    expect(() => requireRole(session("BOOKING_OFFICER"), "MEMBER")).not.toThrow();
  });

  it("throws FORBIDDEN when session role is below required", () => {
    expect(() => requireRole(session("MEMBER"), "BOOKING_OFFICER")).toThrow(
      AuthError
    );
    try {
      requireRole(session("BOOKING_OFFICER"), "ADMIN");
    } catch (e) {
      expect((e as AuthError).code).toBe("FORBIDDEN");
    }
  });
});

describe("authErrorToResult", () => {
  it("converts AuthError to a { success: false, error } shape", () => {
    const e = new AuthError("FORBIDDEN", "Requires ADMIN");
    expect(authErrorToResult(e)).toEqual({
      success: false,
      error: "Requires ADMIN",
    });
  });

  it("returns null for non-AuthError values (caller re-throws)", () => {
    expect(authErrorToResult(new Error("kaboom"))).toBeNull();
    expect(authErrorToResult("string")).toBeNull();
    expect(authErrorToResult(undefined)).toBeNull();
  });
});
