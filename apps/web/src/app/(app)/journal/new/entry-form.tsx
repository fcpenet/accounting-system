"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import {
  type Account,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type Cents,
  type Direction,
  formatAmount,
  parseAmount,
} from "@acct/core";
import { createEntryAction } from "@/actions/entries";
import { type ActionState, idle } from "@/lib/action-state";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";

interface Row {
  key: number;
  accountId: string;
  direction: Direction;
  amount: string;
  memo: string;
}

let nextKey = 0;
const blankRow = (direction: Direction): Row => ({
  key: nextKey++,
  accountId: "",
  direction,
  amount: "",
  memo: "",
});

/** Amount text -> cents, or null if it isn't a number yet. Used for the
 *  live balance readout, which must never throw as the user types. */
function tryParse(amount: string): number | null {
  if (amount.trim() === "") return null;
  try {
    const value = parseAmount(amount);
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function SubmitButton({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  return (
    <Button type="submit" variant="primary" disabled={pending || disabled}>
      {pending ? "Posting…" : "Post entry"}
    </Button>
  );
}

export function EntryForm({
  accounts,
  today,
}: {
  accounts: Account[];
  today: string;
}) {

  const [state, formAction, isPending] = useActionState(createEntryAction, idle);

  /*
   * Submitted through startTransition rather than the form's `action` prop.
   *
   * React 19 resets a form once its `action` settles. Controlled <input>s
   * recover on the next commit, but a reset <select> keeps the reset value —
   * its props haven't changed, so React has nothing to reconcile — and every
   * rejected entry silently cleared the chosen accounts. Driving the action
   * ourselves skips the reset, so state stays the single source of truth.
   */
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
  const [rows, setRows] = useState<Row[]>(() => [blankRow("debit"), blankRow("credit")]);

  /*
   * Controlled, like the line rows already were. React 19 resets
   * uncontrolled inputs once a form action settles, so a rejected entry
   * used to clear the description and date while leaving the lines —
   * losing exactly the fields that are slowest to retype.
   */
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");

  const grouped = useMemo(
    () =>
      ACCOUNT_TYPES.map((type) => ({
        type,
        label: ACCOUNT_TYPE_LABELS[type],
        accounts: accounts.filter((account) => account.type === type),
      })).filter((group) => group.accounts.length > 0),
    [accounts],
  );

  const totals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const row of rows) {
      const value = tryParse(row.amount);
      if (value === null) continue;
      if (row.direction === "debit") debits += value;
      else credits += value;
    }
    return { debits, credits, difference: debits - credits };
  }, [rows]);

  const hasAmounts = totals.debits > 0 || totals.credits > 0;
  const balanced = hasAmounts && totals.difference === 0;

  const update = (key: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => setRows((current) => [...current, blankRow("debit")]);
  const removeRow = (key: number) =>
    setRows((current) =>
      current.length <= 2 ? current : current.filter((row) => row.key !== key),
    );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Card className="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              name="description"
              required
              placeholder="e.g. Invoice #1024 — Acme Corp"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <Field label="Date" htmlFor="date">
            <Input
              id="date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Reference" htmlFor="reference" hint="Optional — invoice or receipt number">
            <Input
              id="reference"
              name="reference"
              placeholder="INV-1024"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="border-line flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Lines</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            Add line
          </Button>
        </div>

        <ul className="divide-line divide-y">
          {rows.map((row, index) => {
            const accountError =
              state.fieldErrors?.[`accountId.${index}`] ?? undefined;
            const amountError = state.fieldErrors?.[`amount.${index}`] ?? undefined;

            return (
              <li key={row.key} className="p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,8rem)_2.5rem] sm:items-end">
                  <Field label="Account" htmlFor={`account-${row.key}`} error={accountError}>
                    <Select
                      id={`account-${row.key}`}
                      name="accountId"
                      value={row.accountId}
                      invalid={Boolean(accountError)}
                      onChange={(event) => update(row.key, { accountId: event.target.value })}
                    >
                      <option value="">Select an account…</option>
                      {grouped.map((group) => (
                        <optgroup key={group.type} label={group.label}>
                          {group.accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} · {account.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>

                  {/*
                    Segmented control rather than a dropdown: debit/credit is
                    the choice users make most often and it should be one tap.
                  */}
                  <Field label="Side" htmlFor={`direction-${row.key}`}>
                    <div className="border-line-strong flex h-11 overflow-hidden rounded-lg border sm:h-10">
                      {(["debit", "credit"] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          aria-pressed={row.direction === side}
                          onClick={() => update(row.key, { direction: side })}
                          className={`flex-1 text-xs font-medium capitalize transition-colors ${
                            row.direction === side
                              ? "bg-accent text-white"
                              : "text-ink-muted hover:bg-canvas"
                          }`}
                        >
                          {side}
                        </button>
                      ))}
                    </div>
                    <input type="hidden" name="direction" value={row.direction} />
                  </Field>

                  <Field label="Amount" htmlFor={`amount-${row.key}`} error={amountError}>
                    <Input
                      id={`amount-${row.key}`}
                      name="amount"
                      // `decimal` gives phones a numeric keypad with a decimal
                      // point; `numeric` would omit it.
                      inputMode="decimal"
                      placeholder="0.00"
                      className="text-right tnum"
                      value={row.amount}
                      invalid={Boolean(amountError)}
                      onChange={(event) => update(row.key, { amount: event.target.value })}
                    />
                  </Field>

                  <div className="hidden sm:block">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length <= 2}
                      aria-label={`Remove line ${index + 1}`}
                      className="w-full"
                    >
                      ✕
                    </Button>
                  </div>
                </div>

                <input type="hidden" name="memo" value={row.memo} />

                <div className="mt-2 sm:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length <= 2}
                  >
                    Remove line
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {/*
          The balance readout. Kept adjacent to the lines and updated as you
          type, so an unbalanced entry is obvious before submitting rather
          than after a round-trip.
        */}
        <div className="border-line bg-canvas rounded-b-xl border-t px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-6">
              <div>
                <p className="text-ink-subtle text-xs">Debits</p>
                <p className="tnum font-medium">{formatAmount(totals.debits as Cents)}</p>
              </div>
              <div>
                <p className="text-ink-subtle text-xs">Credits</p>
                <p className="tnum font-medium">{formatAmount(totals.credits as Cents)}</p>
              </div>
            </div>

            {balanced ? (
              <p className="text-positive text-xs font-medium">✓ Balanced</p>
            ) : hasAmounts ? (
              <p className="text-warning-ink text-xs font-medium">
                Out of balance by{" "}
                <span className="tnum">
                  {formatAmount(Math.abs(totals.difference) as Cents)}
                </span>
              </p>
            ) : (
              <p className="text-ink-subtle text-xs">Enter amounts on both sides</p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <SubmitButton disabled={!balanced} pending={isPending} />
      </div>
    </form>
  );
}
