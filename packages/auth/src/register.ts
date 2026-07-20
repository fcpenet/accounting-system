import { DEFAULT_CHART_OF_ACCOUNTS } from "@acct/core";
import {
  type Database,
  accounts,
  db as defaultDb,
  eq,
  organizations,
  sql,
  users,
} from "@acct/db";
import { WeakPasswordError, hashPassword, verifyPassword } from "./password";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError("Enter a valid email address");
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  organizationName: string;
  currency?: string;
}

/**
 * Create an organization, its first user, and a starter chart of accounts.
 *
 * All three happen in one transaction: an org with no accounts, or a user
 * with no org, would both be unusable states to leave behind.
 */
export async function registerUser(
  input: RegisterInput,
  db: Database = defaultDb,
): Promise<{
  userId: string;
  orgId: string;
}> {
  const email = normalizeEmail(input.email);
  assertValidEmail(email);

  const orgName = input.organizationName.trim();
  if (orgName === "") throw new AuthError("Organization name is required");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (error) {
    if (error instanceof WeakPasswordError) throw new AuthError(error.message);
    throw error;
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new AuthError("An account with that email already exists");
  }

  // Case-insensitive: match how the unique index compares. The index is the
  // real guard (see the catch below); this is for a friendly early error.
  const nameTaken = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`lower(${organizations.name}) = ${orgName.toLowerCase()}`)
    .limit(1);
  if (nameTaken.length > 0) {
    throw new AuthError("That organization name is already taken");
  }

  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: orgId,
        name: orgName,
        currency: input.currency ?? "USD",
      });

      await tx.insert(users).values({
        id: userId,
        orgId,
        email,
        passwordHash,
        name: input.name?.trim() || null,
      });

      await tx.insert(accounts).values(
        DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
          orgId,
          code: account.code,
          name: account.name,
          type: account.type,
        })),
      );
    });
  } catch (error) {
    // The unique index is the real guard against two simultaneous signups
    // racing past the check above.
    if (error instanceof Error && /UNIQUE constraint failed: users.email/i.test(error.message)) {
      throw new AuthError("An account with that email already exists");
    }
    // organizations_name_unique indexes lower(name), so a race surfaces as a
    // generic index failure rather than naming the column.
    if (
      error instanceof Error &&
      /UNIQUE constraint failed.*organizations|organizations_name_unique/i.test(error.message)
    ) {
      throw new AuthError("That organization name is already taken");
    }
    throw error;
  }

  return { userId, orgId };
}

/**
 * Verify credentials. Returns null for both "no such user" and "wrong
 * password" — the caller must not distinguish them in its response, or the
 * login form becomes an account-enumeration oracle.
 */
export async function authenticate(
  emailInput: string,
  password: string,
  db: Database = defaultDb,
): Promise<{ userId: string; orgId: string } | null> {
  const email = normalizeEmail(emailInput);

  const rows = await db
    .select({ id: users.id, orgId: users.orgId, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = rows[0];
  // verifyPassword hashes even when there's no user, keeping timing flat.
  const valid = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !valid) return null;
  return { userId: user.id, orgId: user.orgId };
}
