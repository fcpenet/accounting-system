import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { type Permission, can } from "@acct/core";
import {
  type ActiveSession,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  validateSession,
} from "@acct/auth";

/**
 * Cached per request: several server components call this while rendering a
 * single page, and they should share one database round-trip.
 */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const store = await cookies();
  return validateSession(store.get(SESSION_COOKIE)?.value);
});

/**
 * The gate for every authenticated page and action. Returns the session or
 * redirects — so callers can treat the return value as always present, and
 * forgetting to check is not a possible mistake.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Thrown when a signed-in user lacks the permission for an action. Server
 * actions catch this and turn it into a form error; pages let it 403.
 */
export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Require both a session and a permission. The server is the authority on
 * what a role may do — hiding a button is cosmetic, this is the real guard.
 */
export async function requirePermission(
  permission: Permission,
): Promise<ActiveSession> {
  const session = await requireSession();
  if (!can(session.user.role, permission)) throw new ForbiddenError();
  return session;
}

/**
 * Page gate for the superuser area. A non-superuser gets a 404 ("page not
 * available") rather than a redirect: a 404 doesn't confirm the page exists,
 * which is the stronger posture for a management area they shouldn't know
 * about. The nav also hides the link for them.
 */
export async function requireSuperuser(): Promise<ActiveSession> {
  const session = await requireSession();
  if (!session.user.isSuperuser) notFound();
  return session;
}

/**
 * Page gate for the member-management area (admins). Same 404-not-redirect
 * posture as `requireSuperuser`.
 */
export async function requireManager(): Promise<ActiveSession> {
  const session = await requireSession();
  if (!can(session.user.role, "manageMembers")) notFound();
  return session;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Vercel always serves HTTPS; only local dev is plain http.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
