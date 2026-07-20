"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { revokeInvitationAction } from "@/actions/invitations";
import { idle } from "@/lib/action-state";
import { Button } from "@/components/ui";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}

export function RevokeButton({ invitationId }: { invitationId: string }) {
  const [, formAction] = useActionState(revokeInvitationAction, idle);
  return (
    <form action={formAction}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <Inner />
    </form>
  );
}
