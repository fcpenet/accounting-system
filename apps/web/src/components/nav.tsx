"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavItem {
  href: Route;
  label: string;
  icon: ReactNode;
}

const icon = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
    aria-hidden="true"
  >
    {path}
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: icon(<path d="M3 12h4l3 8 4-16 3 8h4" />),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: icon(
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 5v14M4 10h4M4 15h4" />
      </>,
    ),
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: icon(
      <>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </>,
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: icon(
      <>
        <path d="M5 20V10M12 20V4M19 20v-7" />
      </>,
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-3.5-5.5" />
      </>,
    ),
  },
];

const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: icon(
    <>
      <path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4Z" />
    </>,
  ),
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Nav items for this user: the Admin entry only when they're a platform
 *  admin. The page still gates itself; this just hides a dead link. */
function navItemsFor(isAdmin: boolean): NavItem[] {
  return isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
}

/** Fixed bottom tab bar — the primary navigation on phones. */
export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = navItemsFor(isAdmin);

  return (
    <nav
      aria-label="Main"
      className="bg-surface/95 border-line fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-ink-subtle"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Persistent sidebar from `lg` up. */
export function DesktopNav({
  orgName,
  isAdmin = false,
  children,
}: {
  orgName: string;
  isAdmin?: boolean;
  children?: ReactNode | undefined;
}) {
  const pathname = usePathname();
  const items = navItemsFor(isAdmin);

  return (
    <aside className="border-line bg-surface hidden w-60 shrink-0 flex-col border-r lg:flex">
      <div className="border-line border-b px-5 py-4">
        <p className="text-ink truncate text-sm font-semibold">{orgName}</p>
        <p className="text-ink-subtle text-xs">Double-entry ledger</p>
      </div>

      <nav aria-label="Main" className="flex-1 p-3">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-ink-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children ? <div className="border-line border-t p-3">{children}</div> : null}
    </aside>
  );
}
