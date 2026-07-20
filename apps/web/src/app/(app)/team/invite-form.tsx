"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { INVITABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@acct/core";
import { type InviteState, createInvitationAction } from "@/actions/invitations";
import { idle } from "@/lib/action-state";
import { CopyLink } from "@/components/copy-link";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Creating…" : "Create invite link"}
    </Button>
  );
}

export function InviteForm() {
  const [state, formAction] = useActionState<InviteState, FormData>(
    createInvitationAction,
    idle,
  );
  // Controlled so a server error doesn't wipe the fields (React 19 resets
  // uncontrolled inputs after an action) — same lesson as the signup form.
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>("editor");

  return (
    <Card className="p-4 sm:p-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              placeholder="teammate@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Role" htmlFor="invite-role" hint={ROLE_DESCRIPTIONS[role]}>
            <Select
              id="invite-role"
              name="role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as (typeof INVITABLE_ROLES)[number])
              }
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <SubmitButton />
        </div>

        {state.ok && state.link ? (
          <div className="border-line border-t pt-4">
            <Alert tone="success">
              Invite ready for <strong>{state.invitedEmail}</strong>.
            </Alert>
            <div className="mt-3">
              <CopyLink url={state.link} label="Invitation link" />
            </div>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
