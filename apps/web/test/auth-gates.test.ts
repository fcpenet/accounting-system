import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@acct/core";

/**
 * The web authorization gates in lib/auth.ts. These decide who a page or
 * action lets through, so they're worth testing even though they're thin over
 * `can()` (which is tested in @acct/core).
 *
 * The gates are coupled to Next internals, so we mock the boundaries:
 *   - server-only: neutralised (it throws outside an RSC bundle)
 *   - next/navigation: notFound() / redirect() throw identifiable sentinels
 *   - next/headers: a cookie store carrying a session token
 *   - react cache(): identity, so getSession isn't tied to a request scope
 *   - @acct/auth validateSession: returns whatever session the test wants
 */

// `server-only` is aliased to an empty stub in vitest.config.ts.

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ notFound, redirect }));

const cookieStore = { get: vi.fn(() => ({ value: "session-token" })) };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const validateSession = vi.fn();
vi.mock("@acct/auth", () => ({
  SESSION_COOKIE: "acct_session",
  SESSION_DURATION_MS: 1000,
  validateSession,
}));

const { requireSession, requireSuperuser, requireManager, requirePermission, ForbiddenError } =
  await import("@/lib/auth");

function session(over: { role?: Role; isSuperuser?: boolean } = {}) {
  return {
    token: "session-token",
    expiresAt: new Date(Date.now() + 1_000_000),
    user: {
      id: "u1",
      email: "u@test",
      name: null,
      orgId: "o1",
      orgName: "Org",
      currency: "USD",
      role: over.role ?? "admin",
      isSuperuser: over.isSuperuser ?? false,
    },
  };
}

beforeEach(() => {
  notFound.mockClear();
  redirect.mockClear();
  validateSession.mockReset();
  cookieStore.get.mockReturnValue({ value: "session-token" });
});

describe("requireSession", () => {
  it("returns the session when one exists", async () => {
    validateSession.mockResolvedValue(session());
    await expect(requireSession()).resolves.toMatchObject({ user: { id: "u1" } });
  });

  it("redirects to /login when there is no session", async () => {
    validateSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

describe("requireSuperuser", () => {
  it("allows a superuser", async () => {
    validateSession.mockResolvedValue(session({ isSuperuser: true }));
    await expect(requireSuperuser()).resolves.toMatchObject({ user: { isSuperuser: true } });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s a non-superuser (even an admin)", async () => {
    validateSession.mockResolvedValue(session({ role: "admin", isSuperuser: false }));
    await expect(requireSuperuser()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

describe("requireManager", () => {
  it("allows an admin", async () => {
    validateSession.mockResolvedValue(session({ role: "admin" }));
    await expect(requireManager()).resolves.toMatchObject({ user: { role: "admin" } });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s an editor and a viewer", async () => {
    for (const role of ["editor", "viewer"] as const) {
      notFound.mockClear();
      validateSession.mockResolvedValue(session({ role }));
      await expect(requireManager(), role).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound, role).toHaveBeenCalled();
    }
  });
});

describe("requirePermission", () => {
  it("allows a role that has the permission", async () => {
    validateSession.mockResolvedValue(session({ role: "editor" }));
    await expect(requirePermission("write")).resolves.toMatchObject({ user: { role: "editor" } });
  });

  it("throws ForbiddenError for a role that doesn't (for the action layer to catch)", async () => {
    validateSession.mockResolvedValue(session({ role: "viewer" }));
    await expect(requirePermission("write")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reserves manageMembers for admins", async () => {
    validateSession.mockResolvedValue(session({ role: "editor" }));
    await expect(requirePermission("manageMembers")).rejects.toBeInstanceOf(ForbiddenError);

    validateSession.mockResolvedValue(session({ role: "admin" }));
    await expect(requirePermission("manageMembers")).resolves.toBeTruthy();
  });
});
