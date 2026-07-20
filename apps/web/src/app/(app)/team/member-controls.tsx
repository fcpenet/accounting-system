"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from "@acct/core";
import { changeMemberRoleAction, removeMemberAction } from "@/actions/invitations";
import { idle } from "@/lib/action-state";
import { Button, Select } from "@/components/ui";

/**
 * Role selector + remove button for one member, shown to admins for everyone
 * but themselves. The server enforces the real rules (last-admin protection,
 * no self-removal); this is the convenience surface.
 */
export function MemberControls({
  userId,
  role,
}: {
  userId: string;
  role: Role;
}) {
  const [roleState, roleAction] = useActionState(changeMemberRoleAction, idle);
  const [removeState, removeAction] = useActionState(removeMemberAction, idle);

  const error = roleState.error ?? removeState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <form action={roleAction}>
          <input type="hidden" name="userId" value={userId} />
          <RoleSelect defaultRole={role} />
        </form>
        <form action={removeAction}>
          <input type="hidden" name="userId" value={userId} />
          <RemoveButton />
        </form>
      </div>
      {error ? (
        <p className="text-negative text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RoleSelect({ defaultRole }: { defaultRole: Role }) {
  const { pending } = useFormStatus();
  return (
    <Select
      name="role"
      defaultValue={defaultRole}
      disabled={pending}
      // Submitting on change keeps it to one tap; the form wraps this select.
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="min-h-9 w-28 text-xs"
      aria-label="Role"
    >
      {ASSIGNABLE_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "…" : "Remove"}
    </Button>
  );
}
