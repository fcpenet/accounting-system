import { createHash, randomBytes } from "node:crypto";
import {
  type Database,
  db as defaultDb,
  eq,
  invitations,
  organizations,
  sql,
  users,
} from "@acct/db";
import { INVITE_DURATION_MS } from "./invitations";
import { AuthError, assertValidEmail, normalizeEmail } from "./register";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Provision a new organization and issue an owner invitation for it.
 *
 * Platform-admin only — the caller must gate on `isPlatformAdmin` before
 * calling. Unlike a normal invite, this creates an *owner* and doesn't
 * require the caller to be a member of the org, because the org has no
 * members yet. The admin sends the returned link to the intended owner, who
 * accepts it to create their account.
 *
 * The org and its owner-invite are written in one transaction: an org with no
 * way in would be dead on arrival.
 */
export async function provisionOrganization(
  input: { name: string; ownerEmail: string; currency?: string },
  db: Database = defaultDb,
): Promise<{ orgId: string; token: string; ownerEmail: string }> {
  const name = input.name.trim();
  if (name === "") throw new AuthError("Organization name is required");

  const ownerEmail = normalizeEmail(input.ownerEmail);
  assertValidEmail(ownerEmail);

  // Same case-insensitive rule the register path enforces.
  const [clash] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`lower(${organizations.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (clash) throw new AuthError("That organization name is already taken");

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (existingUser) {
    throw new AuthError("That email already has an account; choose a different owner");
  }

  const orgId = crypto.randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DURATION_MS);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: orgId,
        name,
        currency: input.currency ?? "USD",
      });
      await tx.insert(invitations).values({
        id: crypto.randomUUID(),
        orgId,
        email: ownerEmail,
        role: "owner",
        tokenHash: hashToken(token),
        expiresAt,
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed.*organizations|organizations_name_unique/i.test(error.message)
    ) {
      throw new AuthError("That organization name is already taken");
    }
    throw error;
  }

  return { orgId, token, ownerEmail };
}
