import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Invitation required" };

/**
 * Public self-serve signup is disabled: organizations are created by a
 * platform admin, and people join through an invitation link. This page
 * stays so old "/signup" links land somewhere sensible instead of 404-ing.
 */
export default function SignupPage() {
  return (
    <>
      <Card className="p-5">
        <h2 className="text-ink text-sm font-semibold">You need an invitation</h2>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          Accounts are created by joining an organization you&rsquo;ve been invited
          to. Ask an owner of your organization to send you an invite link, then open
          that link to set up your account.
        </p>
      </Card>

      <p className="text-ink-muted mt-5 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-accent font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
