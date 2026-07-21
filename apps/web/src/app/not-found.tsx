import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-ink text-lg font-semibold">Page not available</p>
      <p className="text-ink-muted max-w-sm text-sm">
        {/* Deliberately non-committal: this is also what a viewer sees at an
            admin-only page, so it must not confirm the page exists. */}
        This page doesn&rsquo;t exist or isn&rsquo;t available to your account.
      </p>
      <Link href="/dashboard" className="mt-2">
        <Button variant="primary">Back to overview</Button>
      </Link>
    </div>
  );
}
