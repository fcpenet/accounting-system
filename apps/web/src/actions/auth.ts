"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession, invalidateSession } from "@acct/auth";
import { type ActionState, fail } from "@/lib/action-state";
import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/auth";

// Public self-serve signup was removed: organizations are created by a
// platform admin and joined via invitation (see actions/invitations.ts and
// actions/admin.ts). Only sign-in and sign-out live here now.

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = text(form, "email");
  const password = text(form, "password");

  if (!email || !password) {
    return fail("Enter your email and password");
  }

  let result: Awaited<ReturnType<typeof authenticate>>;
  try {
    result = await authenticate(email, password);
  } catch (error) {
    console.error("login failed", error);
    return fail("Could not sign in. Please try again.");
  }

  // One message for both "no such user" and "wrong password" — anything more
  // specific turns this form into an account-enumeration tool.
  if (!result) return fail("Incorrect email or password");

  const { token, expiresAt } = await createSession(result.userId);
  await setSessionCookie(token, expiresAt);

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session) await invalidateSession(session.token);
  await clearSessionCookie();
  redirect("/login");
}
