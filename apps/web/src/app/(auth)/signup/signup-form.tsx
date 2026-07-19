"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MIN_PASSWORD_LENGTH } from "@acct/core";
import { signUpAction } from "@/actions/auth";
import { type ActionState, idle } from "@/lib/action-state";
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
  /*
   * Every field is controlled.
   *
   * React 19 resets uncontrolled inputs once a form action settles, so with
   * `defaultValue` a single validation error wiped the entire form and the
   * user had to retype fields that were already correct. Controlled values
   * survive the re-render.
   */
  const [organizationName, setOrganizationName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState<string | null>(null);

  const [state, formAction] = useActionState(
    async (prev: ActionState, form: FormData): Promise<ActionState> => {
      // Whether two strings are equal is knowable here. Sending it to the
      // server costs a round trip and tells the user nothing extra.
      if (password !== confirmPassword) {
        setMismatch("Passwords don't match");
        return prev;
      }

      setMismatch(null);
      const result = await signUpAction(prev, form);

      // Clear the passwords once the server has seen them. Re-rendering a
      // password into the markup is a needless exposure, and retyping one
      // field is a far smaller cost than retyping six.
      setPassword("");
      setConfirmPassword("");
      return result;
    },
    idle,
  );

  /** Drop the mismatch warning as soon as the two fields agree again. */
  const syncPasswords = (next: { password?: string; confirm?: string }) => {
    const p = next.password ?? password;
    const c = next.confirm ?? confirmPassword;
    if (mismatch && p === c) setMismatch(null);
  };

  const confirmError = mismatch ?? state.fieldErrors?.["confirmPassword"];

  return (
    <Card className="p-5">
      <form action={formAction} className="flex flex-col gap-4">
        {/*
          A mismatch is reported against the confirm field only, not here as
          well — the same sentence in two places reads as two problems, and
          the field-level message sits where the user will fix it.
        */}
        {state.error && !mismatch ? <Alert>{state.error}</Alert> : null}

        <Field
          label="Organization name"
          htmlFor="organizationName"
          hint="The business these books belong to"
          error={state.fieldErrors?.["organizationName"]}
        >
          <Input
            id="organizationName"
            name="organizationName"
            required
            autoComplete="organization"
            placeholder="Acme Consulting"
            value={organizationName}
            invalid={Boolean(state.fieldErrors?.["organizationName"])}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
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
            value={email}
            invalid={Boolean(state.fieldErrors?.["email"])}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          error={state.fieldErrors?.["password"]}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={password}
            invalid={Boolean(state.fieldErrors?.["password"])}
            onChange={(event) => {
              setPassword(event.target.value);
              syncPasswords({ password: event.target.value });
            }}
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirmPassword" error={confirmError}>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            invalid={Boolean(confirmError)}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              syncPasswords({ confirm: event.target.value });
            }}
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
