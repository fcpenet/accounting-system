"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "@/actions/auth";
import { type ActionState, idle } from "@/lib/action-state";
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
  /*
   * Controlled so a failed attempt doesn't wipe the email — React 19 resets
   * uncontrolled inputs once a form action settles. Mistyping a password
   * should cost you the password field, not both.
   */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [state, formAction] = useActionState(
    async (prev: ActionState, form: FormData): Promise<ActionState> => {
      const result = await signInAction(prev, form);
      // Wrong password? Clear just that field and leave the cursor's work
      // on the email intact.
      setPassword("");
      return result;
    },
    idle,
  );

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
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
