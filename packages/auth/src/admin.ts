import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_CHART_OF_ACCOUNTS } from "@acct/core";
import {
  type Database,
  accounts,
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
 * Provision a new organization and issue an admin invitation for it.
 *
 * Superuser only — the caller must gate on `isSuperuser` before calling.
 * Unlike a normal invite, this creates the org's first *admin* and doesn't
 * require the caller to be a member (the org has no members yet). The
 * superuser sends the returned link to the intended admin, who accepts it to
 * create their account.
 *
 * The org and its admin-invite are written in one transaction: an org with no
 * way in would be dead on arrival.
 */
export async function provisionOrganization(
  input: { name: string; adminEmail: string; currency?: string },
  db: Database = defaultDb,
): Promise<{ orgId: string; token: string; adminEmail: string }> {
  const name = input.name.trim();
  if (name === "") throw new AuthError("Organization name is required");

  const adminEmail = normalizeEmail(input.adminEmail);
  assertValidEmail(adminEmail);

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
    .where(eq(users.email, adminEmail))
    .limit(1);
  if (existingUser) {
    throw new AuthError("That email already has an account; choose a different admin");
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
      // Seed the starter chart so the org is usable the moment its admin
      // joins — the same chart registerUser installs.
      await tx.insert(accounts).values(
        DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
          orgId,
          code: a.code,
          name: a.name,
          type: a.type,
        })),
      );
      await tx.insert(invitations).values({
        id: crypto.randomUUID(),
        orgId,
        email: adminEmail,
        role: "admin",
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

  return { orgId, token, adminEmail };
}
