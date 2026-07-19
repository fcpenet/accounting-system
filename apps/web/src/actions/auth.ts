"use server";

import { redirect } from "next/navigation";
import { AuthError, authenticate, createSession, invalidateSession, registerUser } from "@acct/auth";
import { type ActionState, fail } from "@/lib/action-state";
import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/auth";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function signUpAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = text(form, "email");
  const password = text(form, "password");
  const organizationName = text(form, "organizationName");
  const name = text(form, "name");

  if (password !== text(form, "confirmPassword")) {
    return fail("Passwords don't match", { confirmPassword: "Passwords don't match" });
  }

  let created: { userId: string };
  try {
    created = await registerUser({
      email,
      password,
      organizationName,
      ...(name.trim() ? { name } : {}),
    });
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error("signup failed", error);
    return fail("Could not create the account. Please try again.");
  }

  const { token, expiresAt } = await createSession(created.userId);
  await setSessionCookie(token, expiresAt);

  // redirect() signals by throwing, so it must sit outside the try block.
  redirect("/dashboard");
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
