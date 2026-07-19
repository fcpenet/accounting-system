import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  {
    href: "/reports/trial-balance",
    title: "Trial balance",
    description:
      "Every account with its debit and credit totals. The two columns must agree — this is the integrity check on the whole ledger.",
  },
  {
    href: "/reports/income-statement",
    title: "Income statement",
    description:
      "Income less expenses over a period. Also called a profit & loss statement.",
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance sheet",
    description:
      "Assets, liabilities and equity at a point in time. Assets must equal liabilities plus equity.",
  },
] as const;

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" />

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href} className="group">
            <Card className="hover:border-accent h-full p-4 transition-colors">
              <h2 className="group-hover:text-accent text-sm font-semibold transition-colors">
                {report.title}
              </h2>
              <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                {report.description}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
