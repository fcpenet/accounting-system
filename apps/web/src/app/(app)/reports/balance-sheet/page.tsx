import type { Metadata } from "next";
import Link from "next/link";
import { type AccountBalance, balanceSheet } from "@acct/core";
import { DateRangeForm } from "@/components/date-range-form";
import { Money } from "@/components/money";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { listAccounts, listLedgerLines } from "@/lib/queries";

export const metadata: Metadata = { title: "Balance sheet" };

function Rows({ rows }: { rows: AccountBalance[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={2} className="text-ink-subtle px-4 py-2.5 text-xs">
          None
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <tr key={row.account.id} className="hover:bg-canvas">
          <td className="px-4 py-2.5">
            <Link href={`/accounts/${row.account.id}`} className="hover:text-accent">
              <span className="tnum text-ink-subtle text-xs">{row.account.code}</span>{" "}
              {row.account.name}
            </Link>
          </td>
          <td className="px-4 py-2.5 text-right">
            <Money value={row.balance} />
          </td>
        </tr>
      ))}
    </>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <tr className="bg-canvas">
      <th
        scope="colgroup"
        colSpan={2}
        className="text-ink px-4 py-2 text-left text-xs font-semibold tracking-wide uppercase"
      >
        {title}
      </th>
    </tr>
  );
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { user } = await requireSession();
  const params = await searchParams;

  const today = todayISO();
  const asOf = params.to && isValidISODate(params.to) ? params.to : today;

  const [accounts, lines] = await Promise.all([
    listAccounts(user.orgId, { includeArchived: true }),
    listLedgerLines(user.orgId, { to: asOf }),
  ]);

  const report = balanceSheet(lines, accounts, asOf);

  return (
    <>
      <PageHeader
        title="Balance sheet"
        description={`As of ${formatDate(asOf)}`}
        action={
          <Link href="/reports" className="text-accent text-sm font-medium hover:underline">
            ← Reports
          </Link>
        }
      />

      <DateRangeForm action="/reports/balance-sheet" to={asOf} mode="asOf" />

      {!report.balanced ? (
        <div className="mb-4">
          <Alert>
            <strong className="font-semibold">Doesn&rsquo;t balance.</strong> Assets
            don&rsquo;t equal liabilities plus equity — check the trial balance.
          </Alert>
        </div>
      ) : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <tbody className="divide-line divide-y">
              <SectionHead title="Assets" />
              <Rows rows={report.assets} />
              <tr className="border-line border-t font-semibold">
                <td className="px-4 py-2.5">Total assets</td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={report.totalAssets} showZero />
                </td>
              </tr>

              <SectionHead title="Liabilities" />
              <Rows rows={report.liabilities} />
              <tr className="border-line border-t font-medium">
                <td className="px-4 py-2.5">Total liabilities</td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={report.totalLiabilities} showZero />
                </td>
              </tr>

              <SectionHead title="Equity" />
              <Rows rows={report.equity} />
              {/*
                Retained earnings is a computed roll-up of income less expenses
                to date, not an account anyone posts to. Shown explicitly
                because it's what makes the equation close.
              */}
              <tr className="hover:bg-canvas">
                <td className="px-4 py-2.5">
                  Retained earnings
                  <span className="text-ink-subtle ml-1.5 text-xs">
                    (net income to date)
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={report.retainedEarnings} showZero />
                </td>
              </tr>
              <tr className="border-line border-t font-medium">
                <td className="px-4 py-2.5">Total equity</td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={report.totalEquity} showZero />
                </td>
              </tr>
            </tbody>

            <tfoot>
              <tr className="border-line border-t-2 font-semibold">
                <td className="px-4 py-3">Liabilities + equity</td>
                <td className="px-4 py-3 text-right">
                  <Money
                    value={report.totalLiabilities + report.totalEquity}
                    showZero
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {report.balanced ? (
        <p className="text-positive mt-3 text-xs font-medium">
          ✓ Assets = liabilities + equity
        </p>
      ) : null}
    </>
  );
}
