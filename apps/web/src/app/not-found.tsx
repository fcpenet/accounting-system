import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-ink text-lg font-semibold">Not found</p>
      <p className="text-ink-muted max-w-sm text-sm">
        That page doesn&rsquo;t exist, or it belongs to a different organization.
      </p>
      <Link href="/dashboard" className="mt-2">
        <Button variant="primary">Back to overview</Button>
      </Link>
    </div>
  );
}
