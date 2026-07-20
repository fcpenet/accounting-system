import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@acct/core";
import { db, eq, lte, organizations, sessions, users } from "@acct/db";

export const SESSION_COOKIE = "acct_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Sessions inside this window of expiry get extended on use. */
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * The cookie holds a random token; the database stores only its SHA-256.
 * Read access to the sessions table therefore doesn't let anyone log in as
 * a user. Plain SHA-256 is right here (unlike for passwords) because the
 * token is 256 bits of entropy — there is nothing to brute-force.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  orgId: string;
  orgName: string;
  currency: string;
  /** Role within the org — drives what write actions are allowed. */
  role: Role;
  /** Global platform administrator. */
  isPlatformAdmin: boolean;
}

export interface ActiveSession {
  token: string;
  expiresAt: Date;
  user: SessionUser;
}

export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Resolve a cookie token to its user, or null. Expired sessions are deleted
 * on sight rather than merely ignored, which keeps the table self-cleaning
 * without a cron job.
 */
export async function validateSession(
  token: string | undefined,
): Promise<ActiveSession | null> {
  if (!token) return null;

  const sessionId = hashToken(token);

  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      orgId: users.orgId,
      orgName: organizations.name,
      currency: organizations.currency,
      role: users.role,
      isPlatformAdmin: users.isPlatformAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Sliding expiry: an active user shouldn't be logged out mid-month.
  let expiresAt = row.expiresAt;
  if (expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
  }

  return {
    token,
    expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      orgId: row.orgId,
      orgName: row.orgName,
      currency: row.currency,
      role: row.role,
      isPlatformAdmin: row.isPlatformAdmin,
    },
  };
}

export async function invalidateSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Log out everywhere — used after a password change. */
export async function invalidateAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
}
