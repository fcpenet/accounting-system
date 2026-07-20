"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrganizationAction } from "@/actions/admin";
import type { InviteState } from "@/actions/invitations";
import { idle } from "@/lib/action-state";
import { CopyLink } from "@/components/copy-link";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Creating…" : "Create organization"}
    </Button>
  );
}

export function CreateOrgForm() {
  const [state, formAction] = useActionState<InviteState, FormData>(
    createOrganizationAction,
    idle,
  );
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  return (
    <Card className="p-4 sm:p-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organization name" htmlFor="org-name">
            <Input
              id="org-name"
              name="name"
              required
              placeholder="Acme Consulting"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="Admin's email"
            htmlFor="admin-email"
            hint="They'll get an admin-invite link"
          >
            <Input
              id="admin-email"
              name="adminEmail"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              placeholder="admin@example.com"
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
            />
          </Field>
        </div>

        <div>
          <SubmitButton />
        </div>

        {state.ok && state.link ? (
          <div className="border-line border-t pt-4">
            <Alert tone="success">
              Organization created. Send this admin-invite link to{" "}
              <strong>{state.invitedEmail}</strong>.
            </Alert>
            <div className="mt-3">
              <CopyLink url={state.link} label="Admin invitation link" />
            </div>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
