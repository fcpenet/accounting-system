"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type DraftLine, MoneyError, parseAmount } from "@acct/core";
import { postEntry, reverseEntry } from "@acct/ledger";
import { type ActionState, fail } from "@/lib/action-state";
import { requireSession } from "@/lib/auth";

/**
 * Thin adapters over @acct/ledger. Everything here is HTTP plumbing —
 * reading FormData, mapping errors onto form fields, revalidating and
 * redirecting. The rules about what constitutes a valid entry live in
 * @acct/core, and the write path lives in @acct/ledger, where both are
 * tested without a browser.
 */

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function textList(form: FormData, key: string): string[] {
  return form.getAll(key).map((v) => (typeof v === "string" ? v.trim() : ""));
}

function refreshLedgerViews(): void {
  revalidatePath("/journal");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/reports", "layout");
}

export async function createEntryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();

  const accountIds = textList(form, "accountId");
  const directions = textList(form, "direction");
  const amounts = textList(form, "amount");
  const memos = textList(form, "memo");

  const fieldErrors: Record<string, string> = {};
  const lines: DraftLine[] = [];

  accountIds.forEach((accountId, index) => {
    const amountText = amounts[index] ?? "";
    // Blank rows are the form's spare capacity, not an error.
    if (accountId === "" && amountText === "") return;

    if (accountId === "") {
      fieldErrors[`accountId.${index}`] = "Choose an account";
      return;
    }

    let amount;
    try {
      amount = parseAmount(amountText);
    } catch (error) {
      fieldErrors[`amount.${index}`] =
        error instanceof MoneyError ? error.message : "Invalid amount";
      return;
    }

    const direction = directions[index] === "credit" ? "credit" : "debit";
    const memo = memos[index] ?? "";
    lines.push({ accountId, direction, amount, ...(memo ? { memo } : {}) });
  });

  if (Object.keys(fieldErrors).length > 0) {
    return fail("Fix the highlighted lines", fieldErrors);
  }

  const reference = text(form, "reference");

  let result;
  try {
    result = await postEntry(user.orgId, user.id, {
      date: text(form, "date"),
      description: text(form, "description"),
      lines,
      reference: reference || null,
    });
  } catch (error) {
    console.error("failed to post entry", error);
    return fail("Could not save the entry. Please try again.");
  }

  if (!result.ok) {
    for (const error of result.errors) {
      if (error.lineIndex !== null) {
        fieldErrors[`accountId.${error.lineIndex}`] = error.message;
      }
    }
    const summary = result.errors.find((e) => e.lineIndex === null)?.message;
    return fail(summary ?? "This entry isn't valid", fieldErrors);
  }

  refreshLedgerViews();
  // redirect() signals by throwing, so it sits outside the try block.
  redirect(`/journal/${result.value.entryId}`);
}

export async function reverseEntryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { user } = await requireSession();

  const entryId = text(form, "entryId");
  const date = text(form, "date");

  let result;
  try {
    result = await reverseEntry(
      user.orgId,
      user.id,
      entryId,
      date ? { date } : {},
    );
  } catch (error) {
    console.error("failed to reverse entry", error);
    return fail("Could not reverse the entry. Please try again.");
  }

  if (!result.ok) {
    return fail(result.errors[0]?.message ?? "Could not reverse the entry");
  }

  refreshLedgerViews();
  redirect(`/journal/${result.value.reversalId}`);
}
