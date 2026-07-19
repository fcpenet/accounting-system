"use server";

import { revalidatePath } from "next/cache";
import { ACCOUNT_TYPES, type AccountType } from "@acct/core";
import { accounts, and, db, eq, journalLines } from "@acct/db";
import { type ActionState, fail } from "@/lib/action-state";
import { requireSession } from "@/lib/auth";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createAccountAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();

  const code = text(form, "code");
  const name = text(form, "name");
  const type = text(form, "type") as AccountType;

  const fieldErrors: Record<string, string> = {};
  if (!/^\d{3,6}$/.test(code)) {
    fieldErrors["code"] = "Use a 3-6 digit account code, e.g. 5400";
  }
  if (name === "") fieldErrors["name"] = "Name is required";
  if (!ACCOUNT_TYPES.includes(type)) fieldErrors["type"] = "Choose an account type";

  if (Object.keys(fieldErrors).length > 0) {
    return fail("Check the account details", fieldErrors);
  }

  try {
    await db.insert(accounts).values({ orgId: user.orgId, code, name, type });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return fail(`Account code ${code} is already in use`, {
        code: "This code is taken",
      });
    }
    console.error("failed to create account", error);
    return fail("Could not create the account. Please try again.");
  }

  revalidatePath("/accounts");
  return { ok: true };
}

/**
 * Archive rather than delete. An account that has ever been posted to is
 * part of the historical record; removing it would orphan those lines and
 * silently change past reports.
 */
export async function setAccountArchivedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();

  const accountId = text(form, "accountId");
  const archived = text(form, "archived") === "true";

  const result = await db
    .update(accounts)
    .set({ archived })
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, user.orgId)));

  if (result.rowsAffected === 0) {
    return fail("That account doesn't exist");
  }

  revalidatePath("/accounts");
  return { ok: true };
}

/** Delete is only offered for accounts that have never been posted to. */
export async function deleteAccountAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();
  const accountId = text(form, "accountId");

  const used = await db
    .select({ id: journalLines.id })
    .from(journalLines)
    .where(
      and(eq(journalLines.accountId, accountId), eq(journalLines.orgId, user.orgId)),
    )
    .limit(1);

  if (used.length > 0) {
    return fail("This account has postings against it — archive it instead");
  }

  await db
    .delete(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, user.orgId)));

  revalidatePath("/accounts");
  return { ok: true };
}
