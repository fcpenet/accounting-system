"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type Role, isRole } from "@acct/core";
import {
  AuthError,
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createSession,
  removeMember,
  revokeInvitation,
} from "@acct/auth";
import { type ActionState, fail } from "@/lib/action-state";
import { ForbiddenError, requirePermission, setSessionCookie } from "@/lib/auth";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Absolute origin of this deployment, from the request headers. Works on
 *  Vercel (x-forwarded-*) and locally without hard-coding a URL. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export interface InviteState extends ActionState {
  /** The full accept link, surfaced once for the owner to copy. */
  link?: string;
  invitedEmail?: string;
}

/** Owner-only: create an invitation and hand back a copyable link. */
export async function createInvitationAction(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  let session;
  try {
    session = await requirePermission("manageMembers");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return fail("Only an owner can invite members.");
    }
    throw error;
  }

  const email = text(form, "email");
  const roleInput = text(form, "role");
  const role: Role = isRole(roleInput) ? roleInput : "viewer";

  try {
    const { token, invitation } = await createInvitation(
      session.user.orgId,
      session.user.id,
      email,
      role,
    );
    revalidatePath("/team");
    return {
      ok: true,
      link: `${await origin()}/invite/${token}`,
      invitedEmail: invitation.email,
    };
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error("invite failed", error);
    return fail("Could not create the invitation. Please try again.");
  }
}

export async function revokeInvitationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let session;
  try {
    session = await requirePermission("manageMembers");
  } catch (error) {
    if (error instanceof ForbiddenError) return fail("Only an owner can revoke invitations.");
    throw error;
  }

  const invitationId = text(form, "invitationId");
  await revokeInvitation(session.user.orgId, invitationId);
  revalidatePath("/team");
  return { ok: true };
}

/**
 * Accept an invitation: create the account, then sign in. Runs on the public
 * accept page, so it takes no session — the token is the authorization.
 */
export async function acceptInvitationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = text(form, "token");
  const password = text(form, "password");
  const name = text(form, "name");

  if (password !== text(form, "confirmPassword")) {
    return fail("Passwords don't match", { confirmPassword: "Passwords don't match" });
  }

  let created;
  try {
    created = await acceptInvitation(token, { password, ...(name ? { name } : {}) });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error("accept invite failed", error);
    return fail("Could not accept the invitation. Please try again.");
  }

  const { token: sessionToken, expiresAt } = await createSession(created.userId);
  await setSessionCookie(sessionToken, expiresAt);

  redirect("/dashboard");
}

/** Admin-only: remove a member from the org. */
export async function removeMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let session;
  try {
    session = await requirePermission("manageMembers");
  } catch (error) {
    if (error instanceof ForbiddenError) return fail("Only an admin can remove members.");
    throw error;
  }

  try {
    await removeMember(session.user.orgId, session.user.id, text(form, "userId"));
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error("remove member failed", error);
    return fail("Could not remove the member. Please try again.");
  }
  revalidatePath("/team");
  return { ok: true };
}

/** Admin-only: change a member's role. */
export async function changeMemberRoleAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let session;
  try {
    session = await requirePermission("manageMembers");
  } catch (error) {
    if (error instanceof ForbiddenError) return fail("Only an admin can change roles.");
    throw error;
  }

  const roleInput = text(form, "role");
  if (!isRole(roleInput)) return fail("Invalid role");

  try {
    await changeMemberRole(session.user.orgId, session.user.id, text(form, "userId"), roleInput);
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error("change role failed", error);
    return fail("Could not change the role. Please try again.");
  }
  revalidatePath("/team");
  return { ok: true };
}
