import { createHash, randomBytes } from "node:crypto";
import { type Role, can, isRole } from "@acct/core";
import {
  type Database,
  and,
  db as defaultDb,
  eq,
  invitations,
  isNull,
  organizations,
  users,
} from "@acct/db";
import { WeakPasswordError, hashPassword } from "./password";
import { AuthError, assertValidEmail, normalizeEmail } from "./register";

export const INVITE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Only the SHA-256 of the token is stored, like sessions. The raw token has
 * 256 bits of entropy, so a plain hash is right — there is nothing to
 * brute-force, and a database leak yields no redeemable invites.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface InvitationView {
  id: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Create an invitation. Returns the raw token exactly once — it is never
 * recoverable afterwards, so the caller must surface the link now.
 *
 * `inviterUserId` must be an admin of `orgId` (the manageMembers permission);
 * anything less is rejected here rather than trusted from the caller.
 */
export async function createInvitation(
  orgId: string,
  inviterUserId: string,
  emailInput: string,
  role: Role,
  db: Database = defaultDb,
): Promise<{ token: string; invitation: InvitationView }> {
  if (!isRole(role)) {
    throw new AuthError("Choose a role of admin, editor, or viewer");
  }

  const email = normalizeEmail(emailInput);
  assertValidEmail(email);

  const [inviter] = await db
    .select({ role: users.role, orgId: users.orgId })
    .from(users)
    .where(eq(users.id, inviterUserId))
    .limit(1);

  // Only an admin (manageMembers) can invite. Checked here, not trusted from
  // the caller.
  if (!inviter || inviter.orgId !== orgId || !can(inviter.role, "manageMembers")) {
    throw new AuthError("Only an admin can invite members");
  }

  // One account = one org in this model, so someone who already has an
  // account can't join a second org. Say so plainly rather than issue a link
  // that can never be redeemed.
  const [existingUser] = await db
    .select({ id: users.id, orgId: users.orgId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    throw existingUser.orgId === orgId
      ? new AuthError("That person is already a member")
      : new AuthError("That email already has an account on another organization");
  }

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new AuthError("Organization not found");

  // Supersede any earlier pending invite for the same person, so a resend
  // invalidates the previous link instead of leaving two live.
  await db
    .delete(invitations)
    .where(
      and(
        eq(invitations.orgId, orgId),
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
      ),
    );

  const token = randomBytes(32).toString("base64url");
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_DURATION_MS);

  await db.insert(invitations).values({
    id,
    orgId,
    email,
    role,
    tokenHash: hashToken(token),
    invitedByUserId: inviterUserId,
    expiresAt,
  });

  return {
    token,
    invitation: {
      id,
      email,
      role,
      orgId,
      orgName: org.name,
      expiresAt,
      createdAt: new Date(),
    },
  };
}

/** Resolve a token to a live invitation, or null if invalid, expired or
 *  already accepted. Expired invites are cleaned up on sight. */
export async function getInvitationByToken(
  token: string | undefined,
  db: Database = defaultDb,
): Promise<InvitationView | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      orgId: invitations.orgId,
      orgName: organizations.name,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.orgId, organizations.id))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || row.acceptedAt !== null) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(invitations).where(eq(invitations.id, row.id));
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    orgId: row.orgId,
    orgName: row.orgName,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/**
 * Redeem an invitation by creating the invited user inside the inviting org.
 *
 * The new account is bound to the invite's email and role. Everything —
 * user creation and marking the invite accepted — happens in one transaction
 * so a token can't be redeemed twice by two racing requests.
 */
export async function acceptInvitation(
  token: string,
  input: { password: string; name?: string },
  db: Database = defaultDb,
): Promise<{ userId: string; orgId: string }> {
  const invite = await getInvitationByToken(token, db);
  if (!invite) throw new AuthError("This invitation is no longer valid");

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (error) {
    if (error instanceof WeakPasswordError) throw new AuthError(error.message);
    throw error;
  }

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invite.email))
    .limit(1);
  if (taken) throw new AuthError("An account with that email already exists");

  const userId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      // Re-check acceptance inside the transaction: two clicks on the same
      // link must not both create a user.
      const claimed = await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt)));
      if (claimed.rowsAffected === 0) {
        throw new AuthError("This invitation has already been used");
      }

      await tx.insert(users).values({
        id: userId,
        orgId: invite.orgId,
        email: invite.email,
        passwordHash,
        name: input.name?.trim() || null,
        role: invite.role,
      });
    });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: users.email/i.test(error.message)) {
      throw new AuthError("An account with that email already exists");
    }
    throw error;
  }

  return { userId, orgId: invite.orgId };
}

export async function listPendingInvitations(
  orgId: string,
  db: Database = defaultDb,
): Promise<InvitationView[]> {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      orgId: invitations.orgId,
      orgName: organizations.name,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.orgId, organizations.id))
    .where(and(eq(invitations.orgId, orgId), isNull(invitations.acceptedAt)));

  return rows.filter((row) => row.expiresAt.getTime() > Date.now());
}

/** Revoke a pending invitation. Scoped by org so one org can't revoke
 *  another's invites. */
export async function revokeInvitation(
  orgId: string,
  invitationId: string,
  db: Database = defaultDb,
): Promise<boolean> {
  const result = await db
    .delete(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.orgId, orgId)));
  return result.rowsAffected > 0;
}

// ---------------------------------------------------------------------------
// Member management (admins only)
// ---------------------------------------------------------------------------

async function assertActingAdmin(
  orgId: string,
  actingUserId: string,
  db: Database,
): Promise<void> {
  const [actor] = await db
    .select({ role: users.role, orgId: users.orgId })
    .from(users)
    .where(eq(users.id, actingUserId))
    .limit(1);
  if (!actor || actor.orgId !== orgId || !can(actor.role, "manageMembers")) {
    throw new AuthError("Only an admin can manage members");
  }
}

/** Count of admins in an org — used to protect the last one. */
async function adminCount(orgId: string, db: Database): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, "admin")));
  return rows.length;
}

/**
 * Change a member's role. Admins only.
 *
 * Refuses to demote the last admin — an org must always have someone who can
 * manage it. Scoped by org so an admin can't touch another org's members.
 */
export async function changeMemberRole(
  orgId: string,
  actingUserId: string,
  targetUserId: string,
  newRole: Role,
  db: Database = defaultDb,
): Promise<void> {
  if (!isRole(newRole)) throw new AuthError("Invalid role");
  await assertActingAdmin(orgId, actingUserId, db);

  const [target] = await db
    .select({ role: users.role, orgId: users.orgId })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target || target.orgId !== orgId) throw new AuthError("That member doesn't exist");

  if (target.role === newRole) return; // no-op

  if (target.role === "admin" && newRole !== "admin" && (await adminCount(orgId, db)) <= 1) {
    throw new AuthError("This is the last admin — promote someone else first");
  }

  await db
    .update(users)
    .set({ role: newRole })
    .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)));
}

/**
 * Remove a member from the org (deletes the user account). Admins only.
 *
 * Journal entries they created stay — `created_by_user_id` is set null by the
 * foreign key, so history and the audit trail are preserved. Refuses to
 * remove the last admin, and refuses self-removal (leave that to a separate,
 * deliberate flow).
 */
export async function removeMember(
  orgId: string,
  actingUserId: string,
  targetUserId: string,
  db: Database = defaultDb,
): Promise<void> {
  await assertActingAdmin(orgId, actingUserId, db);

  if (targetUserId === actingUserId) {
    throw new AuthError("You can't remove yourself");
  }

  const [target] = await db
    .select({ role: users.role, orgId: users.orgId })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target || target.orgId !== orgId) throw new AuthError("That member doesn't exist");

  if (target.role === "admin" && (await adminCount(orgId, db)) <= 1) {
    throw new AuthError("This is the last admin — promote someone else first");
  }

  await db.delete(users).where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)));
}
