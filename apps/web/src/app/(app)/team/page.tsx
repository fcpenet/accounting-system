import type { Metadata } from "next";
import { ROLE_LABELS, type Role } from "@acct/core";
import { listPendingInvitations } from "@acct/auth";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { listMembers } from "@/lib/queries";
import { InviteForm } from "./invite-form";
import { MemberControls } from "./member-controls";
import { RevokeButton } from "./revoke-button";

export const metadata: Metadata = { title: "Team" };

function RoleBadge({ role }: { role: Role }) {
  const tone = {
    admin: "bg-accent-soft text-accent",
    editor: "bg-positive/10 text-positive",
    viewer: "bg-line text-ink-muted",
  }[role];
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export default async function TeamPage() {
  // Admin-only: non-admins get a 404 ("page not available"), and the Team nav
  // link is hidden for them.
  const { user } = await requireManager();

  const [members, pending] = await Promise.all([
    listMembers(user.orgId),
    listPendingInvitations(user.orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite people to your organization and manage roles."
      />

      <div className="mb-4">
        <InviteForm />
      </div>

      <Card className="mb-4">
        <CardHeader title="Members" subtitle={`${members.length} in this organization`} />
        <ul className="divide-line divide-y">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-ink truncate text-sm font-medium">
                  {member.name ?? member.email}
                  {member.id === user.id ? (
                    <span className="text-ink-subtle ml-1.5 text-xs">(you)</span>
                  ) : null}
                </p>
                <p className="text-ink-subtle truncate text-xs">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {member.isSuperuser ? (
                  <span className="text-warning-ink border-warning-ink/30 shrink-0 rounded border px-2 py-0.5 text-xs font-medium">
                    Superuser
                  </span>
                ) : null}
                {/* Your own row stays a plain badge so you can't lock
                    yourself out or self-demote here. */}
                {member.id !== user.id ? (
                  <MemberControls userId={member.id} role={member.role} />
                ) : (
                  <RoleBadge role={member.role} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Pending invitations" subtitle={`${pending.length} outstanding`} />
        {pending.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="Invites you create appear here until they're accepted or expire."
          />
        ) : (
          <ul className="divide-line divide-y">
            {pending.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-medium">{invite.email}</p>
                  <p className="text-ink-subtle text-xs">
                    {ROLE_LABELS[invite.role]} · expires {formatDate(
                      invite.expiresAt.toISOString().slice(0, 10),
                    )}
                  </p>
                </div>
                <RevokeButton invitationId={invite.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
