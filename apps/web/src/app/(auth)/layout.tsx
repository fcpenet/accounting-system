import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in? The login form has nothing to offer.
  if (await getSession()) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1 className="text-ink text-2xl font-semibold tracking-tight">Ledger</h1>
          <p className="text-ink-muted mt-1 text-sm">Double-entry accounting</p>
        </div>
        {children}
      </div>
    </div>
  );
}
