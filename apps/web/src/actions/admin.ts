"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AuthError, provisionOrganization } from "@acct/auth";
import { fail } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
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
 * Platform-admin only: create an organization and mint the owner-invite link.
 * The admin copies the link to the intended owner, who accepts it to set up
 * their account and take ownership.
 */
export async function createOrganizationAction(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  await requireAdmin(); // redirects non-admins; the real gate

  const name = text(form, "name");
  const ownerEmail = text(form, "ownerEmail");

  try {
    const { token, ownerEmail: email } = await provisionOrganization({ name, ownerEmail });
    revalidatePath("/admin");
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
