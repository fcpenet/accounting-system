"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { reverseEntryAction } from "@/actions/entries";
import { idle } from "@/lib/action-state";
import { Alert, Button, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Reversing…" : "Post reversal"}
    </Button>
  );
}

export function ReverseEntryForm({
  entryId,
  today,
}: {
  entryId: string;
  today: string;
}) {
  const [state, formAction] = useActionState(reverseEntryAction, idle);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Reverse entry
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <input type="hidden" name="entryId" value={entryId} />

      <Field
        label="Reversal date"
        htmlFor="reversal-date"
        hint="Usually today. Use the original date to keep a closed period clean."
      >
        <Input
          id="reversal-date"
          name="date"
          type="date"
          defaultValue={today}
          required
          className="max-w-48"
        />
      </Field>

      <div className="flex gap-2">
        <SubmitButton />
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
