"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@acct/core";
import { createAccountAction } from "@/actions/accounts";
import { idle } from "@/lib/action-state";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Adding…" : "Add account"}
    </Button>
  );
}

export function NewAccountForm() {
  const [state, formAction] = useActionState(createAccountAction, idle);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful add so the next one starts clean.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add account
      </Button>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">Account added.</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_10rem]">
          <Field label="Code" htmlFor="code" error={state.fieldErrors?.["code"]}>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              placeholder="5400"
              required
              className="tnum"
            />
          </Field>

          <Field label="Name" htmlFor="name" error={state.fieldErrors?.["name"]}>
            <Input id="name" name="name" placeholder="Software & Subscriptions" required />
          </Field>

          <Field label="Type" htmlFor="type" error={state.fieldErrors?.["type"]}>
            <Select id="type" name="type" defaultValue="expense" required>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex gap-2">
          <SubmitButton />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </form>
    </Card>
  );
}
