"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "@/actions/auth";
import { idle } from "@/lib/action-state";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(signInAction, idle);

  return (
    <Card className="p-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        <Field label="Email" htmlFor="email">
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

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
