import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "@acct/core";
import { getInvitationByToken } from "@acct/auth";
import { Alert, Button, Card } from "@/components/ui";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvitationByToken(token);

  if (!invite) {
    return (
      <Card className="p-5">
        <Alert>This invitation link is invalid, expired, or already used.</Alert>
        <p className="text-ink-muted mt-4 text-sm">
          Ask whoever invited you to send a fresh link, or{" "}
          <Link href="/login" className="text-accent font-medium hover:underline">
            sign in
          </Link>{" "}
          if you already have an account.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 text-center">
        <p className="text-ink-muted text-sm">
          You&rsquo;ve been invited to join
        </p>
        <p className="text-ink text-lg font-semibold">{invite.orgName}</p>
        <p className="text-ink-subtle text-sm">as {ROLE_LABELS[invite.role]}</p>
      </div>

      <AcceptForm token={token} email={invite.email} />

      <p className="text-ink-subtle mt-5 text-center text-xs">
        Accepting creates your account for {invite.email}.
      </p>
    </>
  );
}
