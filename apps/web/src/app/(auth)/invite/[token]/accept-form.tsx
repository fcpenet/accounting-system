"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MIN_PASSWORD_LENGTH } from "@acct/core";
import { acceptInvitationAction } from "@/actions/invitations";
import { type ActionState, idle } from "@/lib/action-state";
import { PasswordInput } from "@/components/password-input";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="w-full">
      {pending ? "Joining…" : "Accept & create account"}
    </Button>
  );
}

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (prev, form) => {
      if (form.get("password") !== form.get("confirmPassword")) {
        setMismatch("Passwords don't match");
        return prev;
      }
      setMismatch(null);
      return acceptInvitationAction(prev, form);
    },
    idle,
  );

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && !mismatch ? <Alert>{state.error}</Alert> : null}

        <input type="hidden" name="token" value={token} />

        <Field label="Email" htmlFor="email" hint="Set by your invitation">
          {/* Read-only: the invite is bound to this address, so it can't be
              changed here. */}
          <Input id="email" type="email" value={email} readOnly disabled />
        </Field>

        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Optional"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (mismatch && event.target.value === confirmPassword) setMismatch(null);
            }}
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirmPassword" error={mismatch ?? undefined}>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            invalid={Boolean(mismatch)}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (mismatch && event.target.value === password) setMismatch(null);
            }}
          />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
