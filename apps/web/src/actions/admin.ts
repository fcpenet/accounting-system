"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AuthError, provisionOrganization } from "@acct/auth";
import { fail } from "@/lib/action-state";
import { requireSession } from "@/lib/auth";
import type { InviteState } from "@/actions/invitations";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Superuser only: create an organization and mint its admin-invite link. The
 * superuser copies the link to the intended admin, who accepts it to set up
 * their account and run the org.
 */
export async function createOrganizationAction(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  // Defense in depth: the /superuser page already 404s for non-superusers,
  // but the action re-checks so a hand-crafted POST can't provision an org.
  const session = await requireSession();
  if (!session.user.isSuperuser) return fail("You don't have permission to do that.");

  const name = text(form, "name");
  const adminEmail = text(form, "adminEmail");

  try {
    const { token, adminEmail: email } = await provisionOrganization({ name, adminEmail });
    revalidatePath("/superuser");
    return {
      ok: true,
      link: `${await origin()}/invite/${token}`,
      invitedEmail: email,
    };
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error("provision org failed", error);
    return fail("Could not create the organization. Please try again.");
  }
}
