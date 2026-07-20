import Link from "next/link";
import { signOutAction } from "@/actions/auth";
import { DesktopNav, MobileNav } from "@/components/nav";
import { requireSession } from "@/lib/auth";
import { Button } from "@/components/ui";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every page under (app) is gated here, so no individual page can forget.
  const { user } = await requireSession();

  const signOut = (
    <form action={signOutAction}>
      <div className="mb-2">
        <p className="text-ink truncate text-xs font-medium">
          {user.name ?? user.email}
        </p>
        <p className="text-ink-subtle truncate text-xs">{user.email}</p>
      </div>
      <Button type="submit" variant="ghost" size="sm" className="w-full">
        Sign out
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-dvh">
      <DesktopNav orgName={user.orgName} isAdmin={user.isPlatformAdmin}>
          {signOut}
        </DesktopNav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header — the sidebar carries this on desktop. */}
        <header className="border-line bg-surface/95 sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="min-w-0">
            <p className="text-ink truncate text-sm font-semibold">{user.orgName}</p>
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>

        {/* pb-20 clears the fixed tab bar on mobile. */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-20 sm:px-6 lg:pb-8">
          {children}
        </main>
      </div>

      <MobileNav isAdmin={user.isPlatformAdmin} />
    </div>
  );
}
