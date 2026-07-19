"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MIN_PASSWORD_LENGTH } from "@acct/core";
import { signUpAction } from "@/actions/auth";
import { idle } from "@/lib/action-state";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="w-full">
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUpAction, idle);

  return (
    <Card className="p-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        <Field
          label="Organization name"
          htmlFor="organizationName"
          hint="The business these books belong to"
        >
          <Input
            id="organizationName"
            name="organizationName"
            required
            autoComplete="organization"
            placeholder="Acme Consulting"
          />
        </Field>

        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" placeholder="Optional" />
        </Field>

        <Field label="Email" htmlFor="email" error={state.fieldErrors?.["email"]}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>

        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={state.fieldErrors?.["confirmPassword"]}
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>

        <SubmitButton />

        <p className="text-ink-subtle text-xs">
          Your organization starts with a standard chart of accounts, which you can
          edit at any time.
        </p>
      </form>
    </Card>
  );
}
